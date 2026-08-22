import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Printer,
  FileText,
  User,
  Users,
  DollarSign,
  Plus,
  Trash2,
  Edit3,
  CalendarDays,
  ShieldCheck,
  Building2,
  CreditCard,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  CalendarOff,
  FileCheck2,
  Stamp,
  Search,
  RefreshCw,
  Save,
  PenTool,
} from 'lucide-react';
import {
  UserProfile,
  HolidayItem,
  PontoRecord,
  PontoMonthClosing,
  PontoStatus,
} from '../types';
import {
  isCoordenador,
  getRoleBadgeStyle,
} from '../utils/authUtils';
import {
  isWeekend,
  isSaturday,
  isSunday,
  isHolidayOrRecess,
  formatDateBR,
  getDayNameFull,
  toISODateString,
} from '../utils/dateUtils';
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  formatMinutesToHoursAndMinutes,
  parseContractSchedule,
  applyTolerance,
  calculateDayWorkedMinutes,
  calculateMonthlyPontoFinancials,
  formatCurrencyBR,
  generateDigitalSignatureHash,
  getMonthNameBR,
  numberToWordsBRL,
} from '../utils/pontoUtils';
import { HolidayManager } from './HolidayManager';

interface LivroPontoProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  holidays: HolidayItem[];
  pontoRecords: PontoRecord[];
  pontoClosings: PontoMonthClosing[];
  onSavePontoRecord: (record: PontoRecord) => void;
  onBatchSavePontoRecords: (records: PontoRecord[]) => void;
  onSavePontoClosing: (closing: PontoMonthClosing) => void;
  onSaveHoliday?: (holiday: HolidayItem) => void;
  onDeleteHoliday?: (id: string) => void;
  onBatchSaveHolidays?: (holidays: HolidayItem[]) => void;
}

export const LivroPonto: React.FC<LivroPontoProps> = ({
  currentUser,
  users,
  holidays = [],
  pontoRecords = [],
  pontoClosings = [],
  onSavePontoRecord,
  onBatchSavePontoRecords,
  onSavePontoClosing,
  onSaveHoliday,
  onDeleteHoliday,
  onBatchSaveHolidays,
}) => {
  const isAdmin = isCoordenador(currentUser);
  const now = new Date();

  // Current Month / Year selection
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Filtered users list (exclude inactive if any)
  const availableUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users]);

  // Selected User for viewing/editing
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (!isAdmin && currentUser) {
      return currentUser.id;
    }
    return currentUser?.id || users[0]?.id || '';
  });

  // Keep selected user updated if current user changes or selected user not set
  useEffect(() => {
    if (!isAdmin && currentUser) {
      setSelectedUserId(currentUser.id);
    } else if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [isAdmin, currentUser, users, selectedUserId]);

  const targetUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || currentUser || users[0] || null;
  }, [users, selectedUserId, currentUser]);

  // Search filter for user dropdown (admin)
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Modals state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showTimesheetPrintModal, setShowTimesheetPrintModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showEditDayModal, setShowEditDayModal] = useState<PontoRecord | null>(null);

  // Quick punch feedback
  const [punchFeedback, setPunchFeedback] = useState<{
    text: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  // Live time ticker for clock
  const [liveClock, setLiveClock] = useState<string>(() => {
    const d = new Date();
    return d.toLocaleTimeString('pt-BR');
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(new Date().toLocaleTimeString('pt-BR'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Days in selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Existing closing record for this user and month
  const closingRecord = useMemo(() => {
    const id = `${selectedUserId}_${monthKey}`;
    return (
      pontoClosings.find((c) => c.id === id || (c.userId === selectedUserId && c.monthKey === monthKey)) ||
      null
    );
  }, [pontoClosings, selectedUserId, monthKey]);

  const isMonthClosed = !!closingRecord?.isClosed;

  // Month Financial Settings (From closed snapshot if closed, or live targetUser profile)
  const contractSchedule = isMonthClosed && closingRecord?.contractSchedule
    ? closingRecord.contractSchedule
    : (targetUser?.contractSchedule || '11:40 - 17:40');

  const contractDailyHours = isMonthClosed && closingRecord?.contractDailyHours !== undefined
    ? Number(closingRecord.contractDailyHours)
    : (targetUser?.contractDailyHours !== undefined ? Number(targetUser.contractDailyHours) : 6);

  const contractDailyMinutes = isMonthClosed && closingRecord?.contractDailyMinutes !== undefined
    ? Number(closingRecord.contractDailyMinutes)
    : (targetUser?.contractDailyMinutes !== undefined
        ? Number(targetUser.contractDailyMinutes)
        : (targetUser?.contractDailyHours !== undefined ? Math.round(Number(targetUser.contractDailyHours) * 60) : 360));

  const contractDailyHoursFormatted = isMonthClosed && closingRecord?.contractDailyHoursFormatted
    ? closingRecord.contractDailyHoursFormatted
    : (targetUser?.contractDailyHoursFormatted || formatMinutesToHoursAndMinutes(contractDailyMinutes));

  const baseSalary = isMonthClosed && closingRecord?.baseSalary !== undefined && closingRecord?.baseSalary !== null
    ? Number(closingRecord.baseSalary)
    : (targetUser?.baseSalary !== undefined && targetUser?.baseSalary !== null ? Number(targetUser.baseSalary) : 1200);

  const companyName = isMonthClosed && closingRecord?.companyName
    ? closingRecord.companyName
    : (targetUser?.company || 'GADAL - Gestão e Apoio');

  const institutionName = 'Instituto Educacional Crescer - Colégio Crescer';

  const pixKey = isMonthClosed && closingRecord?.pixKey
    ? closingRecord.pixKey
    : (targetUser?.pixKey || targetUser?.phone || 'Não informada');

  // Manual financial adjustments states (loaded from closing record or local state)
  const [manualAddition, setManualAddition] = useState<number>(() => closingRecord?.manualAddition || 0);
  const [manualAdditionNote, setManualAdditionNote] = useState<string>(() => closingRecord?.manualAdditionNote || '');
  const [manualDiscount, setManualDiscount] = useState<number>(() => closingRecord?.manualDiscount || 0);
  const [manualDiscountNote, setManualDiscountNote] = useState<string>(() => closingRecord?.manualDiscountNote || '');

  // Keep state in sync with closingRecord when switching month/user
  useEffect(() => {
    setManualAddition(closingRecord?.manualAddition || 0);
    setManualAdditionNote(closingRecord?.manualAdditionNote || '');
    setManualDiscount(closingRecord?.manualDiscount || 0);
    setManualDiscountNote(closingRecord?.manualDiscountNote || '');
  }, [closingRecord, selectedUserId, monthKey]);

  // Get user's records for this month
  const monthUserRecords = useMemo(() => {
    return pontoRecords.filter(
      (r) => r.userId === selectedUserId && r.date && r.date.startsWith(monthKey)
    );
  }, [pontoRecords, selectedUserId, monthKey]);

  // Construct full month days grid (01 to daysInMonth)
  const monthDaysGrid = useMemo(() => {
    const list: {
      dayNumber: number;
      dateStr: string;
      dayOfWeekName: string;
      dayOfWeekShort: string;
      isWk: boolean;
      isSat: boolean;
      isSun: boolean;
      holidayItem?: HolidayItem;
      record?: PontoRecord;
      defaultStatus: PontoStatus;
    }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayPad = String(day).padStart(2, '0');
      const dateStr = `${monthKey}-${dayPad}`;
      const d = new Date(selectedYear, selectedMonth - 1, day);
      const isSat = isSaturday(dateStr);
      const isSun = isSunday(dateStr);
      const isWk = isSat || isSun;
      const holidayItem = isHolidayOrRecess(dateStr, holidays);

      let defaultStatus: PontoStatus = 'normal';
      if (isSun) defaultStatus = 'domingo';
      else if (isSat) defaultStatus = 'sabado';
      else if (holidayItem) {
        defaultStatus = holidayItem.type === 'feriado' ? 'feriado' : 'recesso';
      }

      const existingRecord = monthUserRecords.find((r) => r.date === dateStr);

      list.push({
        dayNumber: day,
        dateStr,
        dayOfWeekName: getDayNameFull(d),
        dayOfWeekShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()],
        isWk,
        isSat,
        isSun,
        holidayItem,
        record: existingRecord,
        defaultStatus: existingRecord?.status || defaultStatus,
      });
    }
    return list;
  }, [selectedYear, selectedMonth, monthKey, daysInMonth, holidays, monthUserRecords]);

  // Financial Calculations
  const financials = useMemo(() => {
    return calculateMonthlyPontoFinancials({
      records: monthUserRecords,
      holidays,
      year: selectedYear,
      month: selectedMonth,
      baseSalary,
      divisorDays: 30,
      contractDailyHours,
      contractDailyMinutes,
      contractDailyHoursFormatted,
      contractSchedule,
      manualAddition,
      manualDiscount,
    });
  }, [
    monthUserRecords,
    holidays,
    selectedYear,
    selectedMonth,
    baseSalary,
    contractDailyHours,
    contractDailyMinutes,
    contractDailyHoursFormatted,
    contractSchedule,
    manualAddition,
    manualDiscount,
  ]);

  // Handle Quick Punch (Registrar Batida Agora)
  const handleQuickPunch = () => {
    if (isMonthClosed) {
      setPunchFeedback({
        text: 'O mês está Fechado/Travado. Não é possível registrar novas batidas.',
        type: 'error',
      });
      setTimeout(() => setPunchFeedback(null), 4000);
      return;
    }

    const todayStr = toISODateString(new Date());
    if (!todayStr.startsWith(monthKey)) {
      setPunchFeedback({
        text: `Atenção: A data de hoje (${formatDateBR(todayStr)}) não pertence ao mês visualizado (${getMonthNameBR(selectedMonth)}/${selectedYear}). Navegue para o mês atual para bater ponto.`,
        type: 'info',
      });
      setTimeout(() => setPunchFeedback(null), 5000);
      return;
    }

    const currentHoursMinutes = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayRecord = monthUserRecords.find((r) => r.date === todayStr);

    let updatedRecord: PontoRecord;
    let punchSlotName = '';

    const { start, end } = parseContractSchedule(contractSchedule);
    const startTol = applyTolerance(currentHoursMinutes, start, 5);
    const endTol = applyTolerance(currentHoursMinutes, end, 5);

    if (!dayRecord || !dayRecord.entry1) {
      // Slot 1: Entrada 1
      punchSlotName = 'Entrada (Início da Jornada)';
      const effectivePunch = startTol.isWithinTolerance ? start : currentHoursMinutes;
      updatedRecord = {
        id: `${selectedUserId}_${todayStr}`,
        userId: selectedUserId,
        userName: targetUser?.name || '',
        date: todayStr,
        monthKey,
        dayNumber: now.getDate(),
        entry1: effectivePunch,
        exit1: dayRecord?.exit1 || '',
        entry2: dayRecord?.entry2 || '',
        exit2: dayRecord?.exit2 || '',
        status: 'normal',
        createdAt: dayRecord?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Sistema',
      };
    } else if (!dayRecord.exit2 && !dayRecord.exit1) {
      // Slot 2: Saída
      punchSlotName = 'Saída (Fim da Jornada)';
      const effectivePunch = endTol.isWithinTolerance ? end : currentHoursMinutes;
      updatedRecord = {
        ...dayRecord,
        exit2: effectivePunch,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Sistema',
      };
    } else if (dayRecord.exit1 && !dayRecord.entry2) {
      // Retorno do Intervalo
      punchSlotName = 'Retorno do Intervalo (Entrada 2)';
      updatedRecord = {
        ...dayRecord,
        entry2: currentHoursMinutes,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Sistema',
      };
    } else if (dayRecord.entry2 && !dayRecord.exit2) {
      punchSlotName = 'Saída Final';
      const effectivePunch = endTol.isWithinTolerance ? end : currentHoursMinutes;
      updatedRecord = {
        ...dayRecord,
        exit2: effectivePunch,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Sistema',
      };
    } else {
      setPunchFeedback({
        text: 'Todas as batidas de hoje já foram preenchidas. Use o botão de editar caso precise ajustar.',
        type: 'info',
      });
      setTimeout(() => setPunchFeedback(null), 4000);
      return;
    }

    onSavePontoRecord(updatedRecord);
    setPunchFeedback({
      text: `Batida de ${punchSlotName} registrada com sucesso às ${currentHoursMinutes}! (Tolerância contratual de 5 min aplicada)`,
      type: 'success',
    });
    setTimeout(() => setPunchFeedback(null), 4500);
  };

  // Month Navigation
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // Lock / Unlock Month Closing (Admin Only)
  const handleToggleMonthLock = () => {
    if (!isAdmin) return;

    const newClosedState = !isMonthClosed;
    const closingId = `${selectedUserId}_${monthKey}`;

    const newClosing: PontoMonthClosing = {
      id: closingId,
      userId: selectedUserId,
      userName: targetUser?.name || 'Colaborador',
      userCargo: targetUser?.cargoLabel || 'Estagiária',
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      baseSalary,
      divisorDays: 30,
      contractDailyHours,
      contractDailyMinutes,
      contractDailyHoursFormatted,
      contractSchedule,
      companyName,
      institutionName,
      pixKey,
      unjustifiedAbsencesCount: financials.unjustifiedAbsencesCount,
      unjustifiedAbsencesDiscount: financials.unjustifiedAbsencesDiscount,
      extraMinutesTotal: financials.totalExtraMinutes,
      extraHoursAmount: financials.extraHoursAmount,
      manualAddition,
      manualAdditionNote,
      manualDiscount,
      manualDiscountNote,
      netTotal: financials.netTotal,
      isClosed: newClosedState,
      closedAt: newClosedState ? new Date().toISOString() : '',
      closedBy: newClosedState ? currentUser?.name || 'Coordenação' : '',
      signedDigitally: closingRecord?.signedDigitally || false,
      signedAt: closingRecord?.signedAt || '',
      signedBy: closingRecord?.signedBy || '',
      digitalSignatureHash: closingRecord?.digitalSignatureHash || '',
      updatedAt: new Date().toISOString(),
    };

    onSavePontoClosing(newClosing);
  };

  // Save Manual Adjustments
  const handleSaveAdjustments = () => {
    const closingId = `${selectedUserId}_${monthKey}`;
    const newClosing: PontoMonthClosing = {
      id: closingId,
      userId: selectedUserId,
      userName: targetUser?.name || 'Colaborador',
      userCargo: targetUser?.cargoLabel || 'Estagiária',
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      baseSalary,
      divisorDays: 30,
      contractDailyHours,
      contractDailyMinutes,
      contractDailyHoursFormatted,
      contractSchedule,
      companyName,
      institutionName,
      pixKey,
      unjustifiedAbsencesCount: financials.unjustifiedAbsencesCount,
      unjustifiedAbsencesDiscount: financials.unjustifiedAbsencesDiscount,
      extraMinutesTotal: financials.totalExtraMinutes,
      extraHoursAmount: financials.extraHoursAmount,
      manualAddition,
      manualAdditionNote,
      manualDiscount,
      manualDiscountNote,
      netTotal: financials.netTotal,
      isClosed: isMonthClosed,
      closedAt: closingRecord?.closedAt || '',
      closedBy: closingRecord?.closedBy || '',
      signedDigitally: closingRecord?.signedDigitally || false,
      signedAt: closingRecord?.signedAt || '',
      signedBy: closingRecord?.signedBy || '',
      digitalSignatureHash: closingRecord?.digitalSignatureHash || '',
      updatedAt: new Date().toISOString(),
    };
    onSavePontoClosing(newClosing);
    setPunchFeedback({ text: 'Ajustes financeiros salvos com sucesso!', type: 'success' });
    setTimeout(() => setPunchFeedback(null), 3000);
  };

  // Digital Signature action for Collaborator / Admin
  const handleSignReceiptDigitally = () => {
    const closingId = `${selectedUserId}_${monthKey}`;
    const nowIso = new Date().toISOString();
    const hash = generateDigitalSignatureHash(
      selectedUserId,
      targetUser?.name || 'Colaborador',
      monthKey,
      nowIso
    );

    const updatedClosing: PontoMonthClosing = {
      id: closingId,
      userId: selectedUserId,
      userName: targetUser?.name || 'Colaborador',
      userCargo: targetUser?.cargoLabel || 'Estagiária',
      monthKey,
      year: selectedYear,
      month: selectedMonth,
      baseSalary,
      divisorDays: 30,
      contractDailyHours,
      contractDailyMinutes,
      contractDailyHoursFormatted,
      contractSchedule,
      companyName,
      institutionName,
      pixKey,
      unjustifiedAbsencesCount: financials.unjustifiedAbsencesCount,
      unjustifiedAbsencesDiscount: financials.unjustifiedAbsencesDiscount,
      extraMinutesTotal: financials.totalExtraMinutes,
      extraHoursAmount: financials.extraHoursAmount,
      manualAddition,
      manualAdditionNote,
      manualDiscount,
      manualDiscountNote,
      netTotal: financials.netTotal,
      isClosed: isMonthClosed,
      closedAt: closingRecord?.closedAt || '',
      closedBy: closingRecord?.closedBy || '',
      signedDigitally: true,
      signedAt: nowIso,
      signedBy: currentUser?.name || targetUser?.name || 'Colaborador',
      digitalSignatureHash: hash,
      updatedAt: nowIso,
    };

    onSavePontoClosing(updatedClosing);
    setPunchFeedback({
      text: 'Recibo assinado digitalmente com sucesso! Carimbo jurídico registrado.',
      type: 'success',
    });
    setTimeout(() => setPunchFeedback(null), 4000);
  };

  // Save Day Edit Modal
  const handleSaveDayEdit = (recordToSave: PontoRecord) => {
    onSavePontoRecord(recordToSave);
    setShowEditDayModal(null);
    setPunchFeedback({ text: 'Registro do dia atualizado com sucesso!', type: 'success' });
    setTimeout(() => setPunchFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Notification Toast */}
      {punchFeedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm font-medium border shadow-lg animate-in fade-in slide-in-from-top-2 ${
            punchFeedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : punchFeedback.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
              : 'bg-indigo-950/80 border-indigo-500/50 text-indigo-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            {punchFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : punchFeedback.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-indigo-400 shrink-0" />
            )}
            <span>{punchFeedback.text}</span>
          </div>
          <button
            onClick={() => setPunchFeedback(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header & Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Title & Live Clock */}
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
                  Livro Ponto & Fechamento de Frequência
                  <span className="text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Controle 100% Digital
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Horário Oficial: <strong className="text-emerald-400">{liveClock}</strong> • Tolerância automática de 5 minutos na entrada e saída
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Punch Button (For Current Day) */}
            <button
              onClick={handleQuickPunch}
              disabled={isMonthClosed}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${
                isMonthClosed
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white border border-emerald-400/40 shadow-emerald-900/30 cursor-pointer'
              }`}
              title="Registrar batida de ponto com o horário exato de agora"
            >
              <Clock className="w-4 h-4" />
              <span>Registrar Batida Agora</span>
            </button>

            {/* Print/View Receipt */}
            <button
              onClick={() => setShowReceiptModal(true)}
              className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              title="Visualizar e Imprimir Recibo de Pagamento (Padrão A4)"
            >
              <FileCheck2 className="w-4 h-4 text-indigo-400" />
              <span>Recibo de Pagamento</span>
            </button>

            {/* Print Timesheet */}
            <button
              onClick={() => setShowTimesheetPrintModal(true)}
              className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition cursor-pointer"
              title="Exportar Espelho de Ponto Mensal Formatado"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Espelho de Ponto</span>
            </button>

            {/* Holiday / Recess Manager */}
            {isAdmin && (
              <button
                onClick={() => setShowHolidayModal(true)}
                className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-sm font-semibold transition cursor-pointer"
                title="Cadastrar e Gerenciar Feriados e Recessos Escolares"
              >
                <CalendarDays className="w-4 h-4 text-amber-400" />
                <span>Feriados & Recessos</span>
              </button>
            )}

            {/* Lock / Unlock Month (Admin only) */}
            {isAdmin && (
              <button
                onClick={handleToggleMonthLock}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition cursor-pointer border ${
                  isMonthClosed
                    ? 'bg-amber-600/20 text-amber-300 border-amber-500/40 hover:bg-amber-600/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/40 shadow-indigo-900/20'
                }`}
                title={isMonthClosed ? 'Reabrir mês para permitir edições' : 'Fechar e travar folha deste mês'}
              >
                {isMonthClosed ? (
                  <>
                    <Unlock className="w-4 h-4 text-amber-400" />
                    <span>Reabrir Mês</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-indigo-200" />
                    <span>Fechar e Travar Mês</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filters Row: Month Picker & Collaborator Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-slate-800">
          {/* Month Selector */}
          <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-xl p-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 text-center font-bold text-slate-200 text-sm">
              <span className="text-indigo-400 uppercase tracking-wider text-xs block font-semibold">
                Mês de Competência
              </span>
              {getMonthNameBR(selectedMonth)} de {selectedYear}
            </div>

            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              title="Próximo Mês"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Collaborator Selector (Admin or Locked for standard user) & Badges */}
          <div className="md:col-span-2 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            {/* Left side: Colaborador selector */}
            <div className="flex-1 flex items-center space-x-2.5 min-w-0">
              <div className="flex items-center space-x-1.5 shrink-0 text-slate-400 font-medium text-xs">
                <User className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="hidden sm:inline">Colaborador(a):</span>
              </div>

              {isAdmin ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer truncate"
                >
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — ({u.cargoLabel || (u.role === 'coordenador' ? 'Coordenação' : 'Monitora/Professora')})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center space-x-2 text-slate-200 text-sm font-bold truncate">
                  <span className="truncate">{targetUser?.name || currentUser?.name}</span>
                  <span className="text-xs text-slate-400 font-normal shrink-0">
                    ({targetUser?.cargoLabel || 'Estagiária / Monitora'})
                  </span>
                </div>
              )}
            </div>

            {/* Right side: PIX Key & Status Badges (Cleanly separated without any overlap) */}
            <div className="flex items-center flex-wrap gap-2.5 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-800/80">
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs shadow-2xs">
                <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">PIX:</span>
                <span className="font-semibold text-slate-200">{targetUser?.pixKey || targetUser?.phone || 'Pendente'}</span>
              </div>

              {/* Month Status Badge */}
              {isMonthClosed ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap shadow-2xs">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>FECHADO / PAGO</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>EM ABERTO</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Collaborator Card & Contract Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black text-lg shadow-md shadow-indigo-900/10">
              {targetUser?.name ? targetUser.name.substring(0, 2).toUpperCase() : 'CP'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black text-slate-900">{targetUser?.name || 'Colaborador(a)'}</h2>
                <span className="text-xs px-2.5 py-0.5 font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {targetUser?.cargoLabel || 'Estagiária'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Empresa Conveniada: <strong className="text-slate-700">{companyName}</strong> • Instituição de Ensino:{' '}
                <strong className="text-indigo-600">Instituto Educacional Crescer</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-slate-400 block font-medium">Horário Contratual:</span>
              <strong className="text-slate-800 font-bold">{contractSchedule} ({contractDailyHoursFormatted}/dia)</strong>
            </div>
            <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-slate-400 block font-medium">Bolsa Auxílio Base:</span>
              <strong className="text-slate-800 font-bold">{formatCurrencyBR(baseSalary)} / mês</strong>
            </div>
            <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-slate-400 block font-medium">Chave PIX:</span>
              <strong className="text-slate-800 font-mono font-semibold">{pixKey}</strong>
            </div>
          </div>
        </div>

        {/* Digital Signature Status Banner */}
        {closingRecord?.signedDigitally ? (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center space-x-2">
              <Stamp className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Assinado Digitalmente por:</strong> {closingRecord.signedBy} em{' '}
                {new Date(closingRecord.signedAt || '').toLocaleString('pt-BR')} • <strong>Hash de Autenticidade:</strong>{' '}
                <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">
                  {closingRecord.digitalSignatureHash}
                </code>
              </span>
            </div>
            <span className="font-bold text-emerald-700 bg-emerald-200/60 px-2 py-0.5 rounded-full uppercase tracking-wider text-[10px]">
              Válido Juridicamente
            </span>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center space-x-2">
              <PenTool className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Recibo do mês ainda não foi assinado digitalmente pelo colaborador.</span>
            </div>
            {(!isAdmin || currentUser?.id === selectedUserId) && (
              <button
                onClick={handleSignReceiptDigitally}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm transition text-xs flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Assinar Recibo Digitalmente</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Espelho de Ponto Table (01 a 31) */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              Espelho de Frequência Individual — {getMonthNameBR(selectedMonth)} de {selectedYear}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tolerância de 5 minutos aplicada. Sábados, Domingos, Feriados e Recessos são garantidos integralmente.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Feriado/Recesso Pago</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>Falta Injustificada</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
                <th className="py-2.5 px-3 w-16 text-center">Dia</th>
                <th className="py-2.5 px-3 w-28">Dia da Semana</th>
                <th className="py-2.5 px-3 text-center w-24">Entrada 1</th>
                <th className="py-2.5 px-3 text-center w-24">Saída 1</th>
                <th className="py-2.5 px-3 text-center w-24">Entrada 2</th>
                <th className="py-2.5 px-3 text-center w-24">Saída 2</th>
                <th className="py-2.5 px-3 text-center w-36">Status / Ocorrência</th>
                <th className="py-2.5 px-3 w-40">Observações</th>
                {isAdmin && !isMonthClosed && <th className="py-2.5 px-3 w-16 text-center">Editar</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthDaysGrid.map((item) => {
                const isToday = toISODateString(new Date()) === item.dateStr;
                const rec = item.record;
                const status = rec?.status || item.defaultStatus;

                // Row background style
                let rowBg = 'hover:bg-slate-50/70 transition';
                if (isToday) rowBg = 'bg-indigo-50/50 hover:bg-indigo-50 font-medium';
                else if (item.isSun) rowBg = 'bg-slate-50 text-slate-400';
                else if (item.isSat) rowBg = 'bg-slate-50/70 text-slate-400';
                else if (status === 'feriado' || status === 'recesso') rowBg = 'bg-emerald-50/40 text-emerald-900';
                else if (status === 'falta_injustificada') rowBg = 'bg-rose-50/60 text-rose-950';

                return (
                  <tr key={item.dateStr} className={`${rowBg} text-slate-800`}>
                    {/* Day Number */}
                    <td className="py-2 px-3 text-center font-bold font-mono">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded ${
                          isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
                        }`}
                      >
                        {String(item.dayNumber).padStart(2, '0')}
                      </span>
                    </td>

                    {/* Day of Week */}
                    <td className="py-2 px-3 font-semibold text-slate-600">
                      {item.dayOfWeekName}
                    </td>

                    {/* Time Punches */}
                    {status === 'sabado' || status === 'domingo' ? (
                      <td colSpan={4} className="py-2 px-3 text-center text-slate-400 font-semibold italic bg-slate-100/40">
                        {status === 'sabado' ? 'SÁBADO — DESCANSO SEMANAL' : 'DOMINGO — REPOUSO REMUNERADO'}
                      </td>
                    ) : status === 'feriado' || status === 'recesso' ? (
                      <td colSpan={4} className="py-2 px-3 text-center font-bold text-emerald-700 bg-emerald-100/30">
                        ⭐ {status === 'feriado' ? 'FERIADO' : 'RECESSO ESCOLAR'} — {item.holidayItem?.name || 'Abonado / Remunerado'}
                      </td>
                    ) : status === 'falta_injustificada' ? (
                      <td colSpan={4} className="py-2 px-3 text-center font-bold text-rose-600 bg-rose-100/40">
                        ❌ FALTA INJUSTIFICADA (Desconto de 1 Diária)
                      </td>
                    ) : status === 'falta_justificada' || status === 'atestado' ? (
                      <td colSpan={4} className="py-2 px-3 text-center font-bold text-indigo-700 bg-indigo-100/30">
                        📋 {status === 'atestado' ? 'ATESTADO MÉDICO' : 'FALTA JUSTIFICADA / ABONADA'}
                      </td>
                    ) : (
                      <>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                          {rec?.entry1 || '—'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {rec?.exit1 || '—'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {rec?.entry2 || '—'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                          {rec?.exit2 || '—'}
                        </td>
                      </>
                    )}

                    {/* Status Badge */}
                    <td className="py-2 px-3 text-center">
                      {status === 'normal' && (rec?.entry1 || rec?.entry2) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <Check className="w-3 h-3 mr-0.5 text-emerald-600" />
                          PRESENÇA NORMAL
                        </span>
                      )}
                      {status === 'normal' && !rec?.entry1 && !rec?.entry2 && !item.isWk && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                          A Realizar
                        </span>
                      )}
                      {status === 'feriado' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          FERIADO PAGO
                        </span>
                      )}
                      {status === 'recesso' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                          RECESSO PAGO
                        </span>
                      )}
                      {status === 'falta_injustificada' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                          FALTA (-1D)
                        </span>
                      )}
                      {(status === 'falta_justificada' || status === 'atestado') && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          JUSTIFICADA
                        </span>
                      )}
                      {status === 'compensado' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                          COMPENSADO
                        </span>
                      )}
                    </td>

                    {/* Observation note */}
                    <td className="py-2 px-3 text-slate-500 text-[11px] truncate max-w-xs">
                      {rec?.note || item.holidayItem?.description || (item.isWk ? '' : '—')}
                    </td>

                    {/* Admin Action */}
                    {isAdmin && !isMonthClosed && (
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => {
                            const initialRec: PontoRecord = rec || {
                              id: `${selectedUserId}_${item.dateStr}`,
                              userId: selectedUserId,
                              userName: targetUser?.name || '',
                              date: item.dateStr,
                              monthKey,
                              dayNumber: item.dayNumber,
                              entry1: item.isWk ? '' : '11:40',
                              exit1: '',
                              entry2: '',
                              exit2: item.isWk ? '' : '17:40',
                              status: item.defaultStatus,
                            };
                            setShowEditDayModal(initialRec);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                          title="Ajustar horários ou status deste dia"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary & Closing Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Breakdown Card */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Apuração Financeira & Fechamento da Folha
                </h3>
                <p className="text-xs text-slate-500">
                  Divisor Contratual: <strong>30 dias</strong> • Diária: <strong>{formatCurrencyBR(financials.diariaRate)}</strong> • Hora:{' '}
                  <strong>{formatCurrencyBR(financials.hourlyRate)}/h</strong>
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
              Competência: {getMonthNameBR(selectedMonth)}/{selectedYear}
            </span>
          </div>

          {/* Grid of calculations */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-400 font-medium block">Bolsa Auxílio Base:</span>
              <span className="text-base font-black text-slate-800">{formatCurrencyBR(financials.baseSalary)}</span>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-emerald-700 font-medium block">Dias Pagos / Feriados:</span>
              <span className="text-base font-black text-emerald-900">
                {financials.paidHolidaysCount + financials.paidRecessDaysCount} dias (100% Remunerados)
              </span>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <span className="text-rose-700 font-medium block">Faltas Injustificadas:</span>
              <span className="text-base font-black text-rose-900">
                {financials.unjustifiedAbsencesCount} dias ({formatCurrencyBR(-financials.unjustifiedAbsencesDiscount)})
              </span>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
              <span className="text-indigo-700 font-medium block">Horas Extras / Adicionais:</span>
              <span className="text-base font-black text-indigo-900">
                {formatMinutesToTime(financials.totalExtraMinutes)} ({formatCurrencyBR(financials.extraHoursAmount)})
              </span>
            </div>
          </div>

          {/* Admin Adjustments Inputs */}
          {isAdmin ? (
            <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  Ajustes Manuais da Coordenação / GADAL
                </span>
                {!isMonthClosed && (
                  <button
                    onClick={handleSaveAdjustments}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Ajustes</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    (+) Adicional / Gratificação (R$)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      disabled={isMonthClosed}
                      value={manualAddition}
                      onChange={(e) => setManualAddition(Number(e.target.value) || 0)}
                      className="w-28 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 font-semibold"
                      placeholder="0.00"
                    />
                    <input
                      type="text"
                      disabled={isMonthClosed}
                      value={manualAdditionNote}
                      onChange={(e) => setManualAdditionNote(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                      placeholder="Motivo (ex: Ajuda de custo, plantão de sábado)"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    (-) Desconto Manual (R$)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      disabled={isMonthClosed}
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(Number(e.target.value) || 0)}
                      className="w-28 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 font-semibold"
                      placeholder="0.00"
                    />
                    <input
                      type="text"
                      disabled={isMonthClosed}
                      value={manualDiscountNote}
                      onChange={(e) => setManualDiscountNote(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                      placeholder="Motivo (ex: Adiantamento solicitado)"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            (manualAddition > 0 || manualDiscount > 0) && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                {manualAddition > 0 && (
                  <div className="text-emerald-700 font-semibold">
                    (+) Adicional de {formatCurrencyBR(manualAddition)}: {manualAdditionNote || 'Ajuste de coordenação'}
                  </div>
                )}
                {manualDiscount > 0 && (
                  <div className="text-rose-700 font-semibold">
                    (-) Desconto de {formatCurrencyBR(manualDiscount)}: {manualDiscountNote || 'Ajuste de coordenação'}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Big Net Total & Liquid Highlight */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-indigo-300 tracking-wider">
                Valor Líquido a Pagar
              </span>
              <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                <CreditCard className="w-5 h-5" />
              </span>
            </div>

            <div className="mt-4">
              <div className="text-3xl font-black text-emerald-400 tracking-tight">
                {formatCurrencyBR(financials.netTotal)}
              </div>
              <p className="text-xs text-slate-300 mt-1 italic capitalize">
                ({numberToWordsBRL(financials.netTotal)})
              </p>
            </div>

            <div className="mt-5 space-y-1.5 text-xs text-slate-300 border-t border-slate-800 pt-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Favorecida:</span>
                <span className="font-bold text-white">{targetUser?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Chave PIX:</span>
                <span className="font-mono text-emerald-300">{pixKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status da Folha:</span>
                <span className={`font-bold ${isMonthClosed ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isMonthClosed ? 'FECHADO / PAGO' : 'ABERTO / EM APONTAMENTO'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col gap-2">
            <button
              onClick={() => setShowReceiptModal(true)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition shadow-md shadow-indigo-900/30"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Gerar Recibo Oficial com Quitação</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: RECIBO DE PAGAMENTO (PADRÃO A4 PARA IMPRESSÃO) */}
      {/* ========================================================================= */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-6 border border-slate-300">
            {/* Modal Control Header (Hidden in print) */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
              <div className="flex items-center space-x-2">
                <FileCheck2 className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">Recibo de Bolsa Auxílio & Termo de Quitação</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir (A4)</span>
                </button>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div className="p-8 sm:p-10 space-y-6 text-slate-800 text-xs font-sans">
              {/* Institutional Header */}
              <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
                <h2 className="text-base font-black tracking-wide uppercase text-slate-900">
                  INSTITUTO EDUCACIONAL CRESCER • COLÉGIO CRESCER
                </h2>
                <p className="text-xs font-semibold text-slate-600">
                  EMPRESA CONVENIADA: <strong className="text-slate-900 uppercase">{companyName}</strong>
                </p>
                <div className="inline-block mt-1 px-4 py-1 bg-slate-100 rounded-full font-black text-xs uppercase tracking-widest text-slate-900">
                  RECIBO DE PAGAMENTO DE BOLSA AUXÍLIO
                </div>
              </div>

              {/* Identification Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Beneficiária / Estagiária:</span>
                  <strong className="text-xs text-slate-900">{targetUser?.name}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Cargo / Função:</span>
                  <strong className="text-xs text-slate-900">{targetUser?.cargoLabel || 'Estagiária'}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Mês de Competência:</span>
                  <strong className="text-xs text-slate-900">{getMonthNameBR(selectedMonth)} / {selectedYear}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Horário Contratual:</span>
                  <strong className="text-xs text-slate-900">{contractSchedule} ({contractDailyHoursFormatted}/dia)</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Forma de Pagamento / PIX:</span>
                  <strong className="text-xs text-slate-900 font-mono">{pixKey}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Base de Cálculo (30 Dias):</span>
                  <strong className="text-xs text-slate-900">{formatCurrencyBR(baseSalary)}</strong>
                </div>
              </div>

              {/* Discriminative Table */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold uppercase text-[10px]">
                      <th className="p-2.5">Descrição dos Lançamentos</th>
                      <th className="p-2.5 text-center w-24">Referência</th>
                      <th className="p-2.5 text-right w-28">Proventos (R$)</th>
                      <th className="p-2.5 text-right w-28">Descontos (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2.5 font-semibold">Bolsa Auxílio Estágio / Monitoria Integral</td>
                      <td className="p-2.5 text-center">30 dias</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{formatCurrencyBR(financials.baseSalary)}</td>
                      <td className="p-2.5 text-right text-slate-400">—</td>
                    </tr>
                    {financials.paidHolidaysCount + financials.paidRecessDaysCount > 0 && (
                      <tr className="text-emerald-800 bg-emerald-50/40">
                        <td className="p-2.5 font-medium">Feriados e Recessos Escolares Garantidos e Abonados</td>
                        <td className="p-2.5 text-center">{financials.paidHolidaysCount + financials.paidRecessDaysCount} dias</td>
                        <td className="p-2.5 text-right text-slate-400">(Incluso na Bolsa)</td>
                        <td className="p-2.5 text-right text-slate-400">—</td>
                      </tr>
                    )}
                    {financials.unjustifiedAbsencesCount > 0 && (
                      <tr className="text-rose-900 bg-rose-50/40">
                        <td className="p-2.5 font-medium">Desconto de Faltas Injustificadas ({formatCurrencyBR(financials.diariaRate)}/dia)</td>
                        <td className="p-2.5 text-center">{financials.unjustifiedAbsencesCount} dias</td>
                        <td className="p-2.5 text-right text-slate-400">—</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">{formatCurrencyBR(financials.unjustifiedAbsencesDiscount)}</td>
                      </tr>
                    )}
                    {financials.extraHoursAmount > 0 && (
                      <tr className="text-indigo-900 bg-indigo-50/40">
                        <td className="p-2.5 font-medium">Horas / Minutos Extras Apurados</td>
                        <td className="p-2.5 text-center">{formatMinutesToTime(financials.totalExtraMinutes)}</td>
                        <td className="p-2.5 text-right font-bold text-indigo-700">{formatCurrencyBR(financials.extraHoursAmount)}</td>
                        <td className="p-2.5 text-right text-slate-400">—</td>
                      </tr>
                    )}
                    {financials.manualAddition > 0 && (
                      <tr className="text-emerald-900 bg-emerald-50/40">
                        <td className="p-2.5 font-medium">Adicional Especial: {manualAdditionNote || 'Gratificação'}</td>
                        <td className="p-2.5 text-center">—</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">{formatCurrencyBR(financials.manualAddition)}</td>
                        <td className="p-2.5 text-right text-slate-400">—</td>
                      </tr>
                    )}
                    {financials.manualDiscount > 0 && (
                      <tr className="text-rose-900 bg-rose-50/40">
                        <td className="p-2.5 font-medium">Desconto Especial: {manualDiscountNote || 'Ajuste'}</td>
                        <td className="p-2.5 text-center">—</td>
                        <td className="p-2.5 text-right text-slate-400">—</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">{formatCurrencyBR(financials.manualDiscount)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-800 text-slate-900">
                      <td colSpan={2} className="p-3 text-right uppercase">Valor Líquido Total a Pagar:</td>
                      <td colSpan={2} className="p-3 text-right text-base font-black text-emerald-800">
                        {formatCurrencyBR(financials.netTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Written Text & Legal Release Declaration */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-[11px] leading-relaxed text-slate-700">
                <p>
                  <strong>VALOR POR EXTENSO:</strong>{' '}
                  <span className="font-bold text-slate-900 capitalize">{numberToWordsBRL(financials.netTotal)}</span>.
                </p>
                <p className="text-justify">
                  Declaro para os devidos fins de direito que recebi de <strong>Instituto Educacional Crescer / {companyName}</strong> a importância líquida supra descrita, referente ao pagamento de Bolsa Auxílio do mês de competência{' '}
                  <strong>{getMonthNameBR(selectedMonth)} de {selectedYear}</strong>, conferindo plena, rasa, geral e irrevogável quitação de todas as obrigações para nada mais exigir a qualquer título.
                </p>
              </div>

              {/* Signature Stamp or Physical Signature Line */}
              {closingRecord?.signedDigitally ? (
                <div className="p-4 border-2 border-emerald-500/60 bg-emerald-50/40 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5 text-emerald-800 font-black uppercase tracking-wider text-[11px]">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>ASSINATURA DIGITAL REGISTRADA & AUTENTICADA</span>
                    </div>
                    <p className="text-[11px] text-slate-700">
                      Assinado por: <strong>{closingRecord.signedBy}</strong> ({targetUser?.email})
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Data/Hora: {new Date(closingRecord.signedAt || '').toLocaleString('pt-BR')} • IP / Hash:{' '}
                      <code className="font-mono font-bold text-emerald-900">{closingRecord.digitalSignatureHash}</code>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 bg-emerald-600 text-white font-black rounded-lg text-[10px] uppercase tracking-wider shadow-sm">
                      Quitação 100% Válida
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-8 pt-6">
                  <div className="text-center">
                    <div className="border-b border-slate-900 pb-1 w-full"></div>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-1 uppercase">
                      INSTITUTO EDUCACIONAL CRESCER / {companyName}
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-slate-900 pb-1 w-full"></div>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-1">
                      {targetUser?.name?.toUpperCase()} (BENEFICIÁRIA)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ESPELHO DE PONTO IMPRESSÃO (TIMESHEET COMPLETO) */}
      {/* ========================================================================= */}
      {showTimesheetPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-6 border border-slate-300">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Espelho de Ponto Individual Mensal (Folha de Frequência)</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Espelho</span>
                </button>
                <button
                  onClick={() => setShowTimesheetPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-4 text-slate-800 text-xs">
              {/* Timesheet Printable Header */}
              <div className="border-b-2 border-slate-900 pb-3 text-center space-y-0.5">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  INSTITUTO EDUCACIONAL CRESCER • COLÉGIO CRESCER
                </h2>
                <h3 className="text-xs font-bold text-slate-700">
                  ESPELHO DE REGISTRO ELETRÔNICO DE PONTO — {getMonthNameBR(selectedMonth).toUpperCase()} / {selectedYear}
                </h3>
              </div>

              {/* Worker metadata */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
                <div>
                  <span className="text-slate-500">Colaborador(a):</span> <strong>{targetUser?.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Função:</span> <strong>{targetUser?.cargoLabel || 'Estagiária'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Horário:</span> <strong>{contractSchedule} ({contractDailyHoursFormatted}/dia)</strong>
                </div>
                <div>
                  <span className="text-slate-500">Empresa:</span> <strong>{companyName}</strong>
                </div>
                <div>
                  <span className="text-slate-500">PIX:</span> <strong className="font-mono">{pixKey}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Total Faltas:</span>{' '}
                  <strong className={financials.unjustifiedAbsencesCount > 0 ? 'text-rose-600' : 'text-slate-900'}>
                    {financials.unjustifiedAbsencesCount}
                  </strong>
                </div>
              </div>

              {/* Full Timesheet Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold uppercase text-center">
                      <th className="p-1.5 w-10">Dia</th>
                      <th className="p-1.5 w-24">Semana</th>
                      <th className="p-1.5 w-16">Entrada 1</th>
                      <th className="p-1.5 w-16">Saída 1</th>
                      <th className="p-1.5 w-16">Entrada 2</th>
                      <th className="p-1.5 w-16">Saída 2</th>
                      <th className="p-1.5 w-32">Status</th>
                      <th className="p-1.5">Assinatura / Rubrica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {monthDaysGrid.map((item) => {
                      const rec = item.record;
                      const status = rec?.status || item.defaultStatus;
                      return (
                        <tr key={item.dateStr} className={item.isWk ? 'bg-slate-50 text-slate-400' : ''}>
                          <td className="p-1 text-center font-bold font-mono">{item.dayNumber}</td>
                          <td className="p-1 text-center">{item.dayOfWeekShort}</td>
                          {item.isWk ? (
                            <td colSpan={4} className="p-1 text-center italic font-semibold">
                              {item.isSat ? 'SÁBADO' : 'DOMINGO'}
                            </td>
                          ) : status === 'feriado' || status === 'recesso' ? (
                            <td colSpan={4} className="p-1 text-center font-bold text-emerald-800 bg-emerald-50">
                              {status === 'feriado' ? 'FERIADO PAGO' : 'RECESSO PAGO'} ({item.holidayItem?.name || ''})
                            </td>
                          ) : (
                            <>
                              <td className="p-1 text-center font-mono">{rec?.entry1 || '—'}</td>
                              <td className="p-1 text-center font-mono">{rec?.exit1 || '—'}</td>
                              <td className="p-1 text-center font-mono">{rec?.entry2 || '—'}</td>
                              <td className="p-1 text-center font-mono">{rec?.exit2 || '—'}</td>
                            </>
                          )}
                          <td className="p-1 text-center font-semibold">
                            {status === 'normal'
                              ? rec?.entry1
                                ? 'PRESENTE'
                                : '—'
                              : status.toUpperCase()}
                          </td>
                          <td className="p-1 text-center text-slate-300 font-mono">
                            {closingRecord?.signedDigitally ? `[Digital ${closingRecord.digitalSignatureHash?.substring(0, 10)}]` : '__________________'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Signatures footer */}
              <div className="grid grid-cols-2 gap-8 pt-6">
                <div className="text-center">
                  <div className="border-b border-slate-900 pb-1 w-full"></div>
                  <span className="text-[10px] text-slate-500 font-semibold block mt-1">
                    COORDENAÇÃO DO INTEGRAL
                  </span>
                </div>
                <div className="text-center">
                  <div className="border-b border-slate-900 pb-1 w-full"></div>
                  <span className="text-[10px] text-slate-500 font-semibold block mt-1">
                    {targetUser?.name?.toUpperCase()} (ASSINATURA DA COLABORADORA)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDITAR REGISTRO DIÁRIO (ADMIN ONLY) */}
      {/* ========================================================================= */}
      {showEditDayModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-2xl w-full max-w-md border border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                Ajustar Batidas: {formatDateBR(showEditDayModal.date)}
              </h3>
              <button
                onClick={() => setShowEditDayModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Punches Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Entrada 1 (Manhã / Início)</label>
                  <input
                    type="time"
                    value={showEditDayModal.entry1 || ''}
                    onChange={(e) =>
                      setShowEditDayModal({ ...showEditDayModal, entry1: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Saída 1 (Almoço / Saída)</label>
                  <input
                    type="time"
                    value={showEditDayModal.exit1 || ''}
                    onChange={(e) =>
                      setShowEditDayModal({ ...showEditDayModal, exit1: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Entrada 2 (Retorno Almoço)</label>
                  <input
                    type="time"
                    value={showEditDayModal.entry2 || ''}
                    onChange={(e) =>
                      setShowEditDayModal({ ...showEditDayModal, entry2: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Saída 2 (Fim da Jornada)</label>
                  <input
                    type="time"
                    value={showEditDayModal.exit2 || ''}
                    onChange={(e) =>
                      setShowEditDayModal({ ...showEditDayModal, exit2: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Status / Ocorrência do Dia</label>
                <select
                  value={showEditDayModal.status}
                  onChange={(e) =>
                    setShowEditDayModal({
                      ...showEditDayModal,
                      status: e.target.value as PontoStatus,
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold focus:border-indigo-500 focus:outline-none"
                >
                  <option value="normal">Presença Normal (Trabalhado)</option>
                  <option value="falta_injustificada">Falta Injustificada (Descontar 1 Diária)</option>
                  <option value="falta_justificada">Falta Justificada (Abonada / Sem Desconto)</option>
                  <option value="atestado">Atestado Médico (Abonado)</option>
                  <option value="feriado">Feriado (Abonado e Pago)</option>
                  <option value="recesso">Recesso Escolar (Abonado e Pago)</option>
                  <option value="compensado">Dia Compensado / Folga</option>
                  <option value="sabado">Sábado (Folga)</option>
                  <option value="domingo">Domingo (DSR)</option>
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Justificativa / Observação</label>
                <textarea
                  rows={2}
                  value={showEditDayModal.note || ''}
                  onChange={(e) =>
                    setShowEditDayModal({ ...showEditDayModal, note: e.target.value })
                  }
                  placeholder="Ex: Chegada autorizada pela coordenação, consulta médica, etc."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowEditDayModal(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveDayEdit(showEditDayModal)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs shadow-md"
              >
                Salvar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: GERENCIADOR DE FERIADOS & RECESSOS */}
      {/* ========================================================================= */}
      {showHolidayModal && onSaveHoliday && onDeleteHoliday && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 text-white rounded-2xl w-full max-w-4xl border border-slate-800 shadow-2xl p-6 my-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400">
                <CalendarDays className="w-5 h-5" />
                <h3 className="font-bold text-base text-white">Gerenciador de Feriados, Recessos e Pontes</h3>
              </div>
              <button
                onClick={() => setShowHolidayModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <HolidayManager
              holidays={holidays}
              onSaveHoliday={onSaveHoliday}
              onDeleteHoliday={onDeleteHoliday}
              onBatchSaveHolidays={onBatchSaveHolidays}
            />
          </div>
        </div>
      )}
    </div>
  );
};
