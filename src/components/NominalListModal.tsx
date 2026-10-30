import React, { useState, useMemo, useEffect } from 'react';
import {
  Student,
  ActivityItem,
  UserProfile,
  DayOfWeek,
  AttendanceRecord,
  HolidayItem,
  NominalAttendanceFilter,
  NominalStudentTypeFilter,
  NominalPeriodMode,
  NominalReportMetrics,
  NominalProcessedStudent,
} from '../types';
import { generateNominalListPDF } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import {
  isStudentScheduledForDate,
  formatDateBR,
  getDayOfWeekLabel,
  getDayOfWeekFromDate,
  toISODateString,
} from '../utils/dateUtils';
import { normalizeAttendanceStatus } from '../utils/frequenciaUtils';
import {
  BookMarked,
  X,
  Search,
  Download,
  FileText,
  Users,
  CheckCircle2,
  XCircle,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  Printer,
  Sparkles,
} from 'lucide-react';

export interface NominalListModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  records?: AttendanceRecord[];
  turmasList?: string[];
  extracurricularRollCallActivities?: ActivityItem[];
  currentUser?: UserProfile | null;
  defaultTurma?: string;
  defaultSpecialty?: string;
  defaultDay?: string;
  defaultPeriodMode?: NominalPeriodMode;
  defaultDate?: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  holidays?: HolidayItem[];
  anoLetivo?: number;
}

/**
 * Verifica se um aluno é esperado em pelo menos um dia útil do intervalo [startDate, endDate]
 */
function isStudentScheduledInPeriod(
  student: Student,
  startDate: string,
  endDate: string
): boolean {
  if (!student) return false;
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

  const cur = new Date(start);
  let iterations = 0;
  while (cur <= end && iterations < 62) {
    iterations++;
    const dayOfWeekNum = cur.getDay();
    // Apenas dias úteis (Segunda a Sexta)
    if (dayOfWeekNum !== 0 && dayOfWeekNum !== 6) {
      const dateStr = toISODateString(cur);
      if (isStudentScheduledForDate(student, dateStr)) {
        return true;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

export const NominalListModal: React.FC<NominalListModalProps> = ({
  isOpen,
  onClose,
  students = [],
  records = [],
  turmasList = [],
  extracurricularRollCallActivities = [],
  currentUser,
  defaultTurma = 'TODAS',
  defaultSpecialty = 'TODAS',
  defaultDay = 'todos',
  defaultPeriodMode = 'dia',
  defaultDate,
  defaultStartDate,
  defaultEndDate,
  anoLetivo,
}) => {
  const todayStr = useMemo(() => toISODateString(new Date()), []);

  // Filtros principais solicitados:
  // a) Status de Frequência: [Todos] | [Apenas Presentes] | [Apenas Faltosos / Ausentes]
  const [attendanceFilter, setAttendanceFilter] = useState<NominalAttendanceFilter>('todos');

  // b) Tipo de Aluno: [Todos] | [Apenas Regulares] | [Apenas Avulsos]
  const [studentTypeFilter, setStudentTypeFilter] = useState<NominalStudentTypeFilter>('todos');

  // c) Seleção de Período: [Data Específica / Dia] ou [Mês / Intervalo]
  const [periodMode, setPeriodMode] = useState<NominalPeriodMode>(defaultPeriodMode);
  const [selectedDate, setSelectedDate] = useState<string>(defaultDate || todayStr);

  const [startDate, setStartDate] = useState<string>(() => {
    if (defaultStartDate) return defaultStartDate;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return toISODateString(firstDay);
  });

  const [endDate, setEndDate] = useState<string>(defaultEndDate || todayStr);

  // Filtros adicionais de apoio
  const [nominalFilterSpecialty, setNominalFilterSpecialty] = useState<string>(defaultSpecialty);
  const [nominalFilterTurma, setNominalFilterTurma] = useState<string>(defaultTurma);
  const [nominalSearchTerm, setNominalSearchTerm] = useState<string>('');

  // Sincroniza defaults ao abrir
  useEffect(() => {
    if (isOpen) {
      if (defaultSpecialty) setNominalFilterSpecialty(defaultSpecialty);
      if (defaultTurma) setNominalFilterTurma(defaultTurma);
      if (defaultDate) setSelectedDate(defaultDate);
      if (defaultStartDate) setStartDate(defaultStartDate);
      if (defaultEndDate) setEndDate(defaultEndDate);
      if (defaultPeriodMode) setPeriodMode(defaultPeriodMode);
    }
  }, [isOpen, defaultSpecialty, defaultTurma, defaultDate, defaultStartDate, defaultEndDate, defaultPeriodMode]);

  // Modal de visualização do PDF
  const [pdfPreviewState, setPdfPreviewState] = useState<{
    isOpen: boolean;
    doc: any;
    dataUrl: string | null;
    blobUrl: string | null;
    filename: string;
    title: string;
    onDownload?: () => void;
  }>({
    isOpen: false,
    doc: null,
    dataUrl: null,
    blobUrl: null,
    filename: '',
    title: '',
  });

  // Funções de navegação rápida de data
  const handleShiftDay = (delta: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + delta);
      // Pular fins de semana se necessário
      if (d.getDay() === 0) d.setDate(d.getDate() + (delta > 0 ? 1 : -2));
      if (d.getDay() === 6) d.setDate(d.getDate() + (delta > 0 ? 2 : -1));
      setSelectedDate(toISODateString(d));
    }
  };

  const handleApplyPresetPeriod = (preset: 'mes' | 'semana' | 'ultimos30') => {
    const now = new Date();
    if (preset === 'mes') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toISODateString(first));
      setEndDate(toISODateString(now));
    } else if (preset === 'semana') {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      setStartDate(toISODateString(monday));
      setEndDate(toISODateString(friday));
    } else if (preset === 'ultimos30') {
      const past30 = new Date(now);
      past30.setDate(now.getDate() - 30);
      setStartDate(toISODateString(past30));
      setEndDate(toISODateString(now));
    }
  };

  // Motor central de cruzamento de Frequência e Alunos
  const { processedStudents, expectedStudentsList, metrics, finalFilteredStudents } = useMemo(() => {
    const normalizeStr = (s?: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const isAllSpecialties =
      !nominalFilterSpecialty ||
      nominalFilterSpecialty === 'TODAS' ||
      nominalFilterSpecialty === 'TODOS';
    const isAllReforco =
      !isAllSpecialties && normalizeStr(nominalFilterSpecialty) === 'reforco';
    const isRotina =
      !isAllSpecialties && normalizeStr(nominalFilterSpecialty) === 'rotina';
    const isAllTurmas =
      !nominalFilterTurma || nominalFilterTurma === 'TODAS' || nominalFilterTurma === 'TODOS';
    const search = normalizeStr(nominalSearchTerm);

    const recs = Array.isArray(records) ? records : [];

    // 1. Alunos ativos pré-filtrados por Turma, Modalidade e Tipo de Contrato
    const candidateStudents = (Array.isArray(students) ? students : []).filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const st = s.status || s.statusMatricula || 'ativo';
      if (st !== 'ativo') return false;

      // Filtro de Tipo de Aluno
      if (studentTypeFilter === 'regular' && s.tipoContrato === 'avulso') return false;
      if (studentTypeFilter === 'avulso' && s.tipoContrato !== 'avulso') return false;

      // Filtro por Turma
      if (!isAllTurmas && s.turma !== nominalFilterTurma) return false;

      // Filtro por Modalidade
      if (!isAllSpecialties) {
        if (isAllReforco) {
          const hasRef =
            (Array.isArray(s.modalidadesEspeciais) &&
              s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'reforco')) ||
            (Array.isArray(s.specialties) &&
              s.specialties.some((m) => normalizeStr(m) === 'reforco')) ||
            (Array.isArray(s.activities) &&
              s.activities.some((act) => normalizeStr(act) === 'reforco'));
          if (!hasRef) return false;
        } else if (isRotina) {
          const hasRot =
            (Array.isArray(s.activities) &&
              s.activities.some((act) => normalizeStr(act) === 'rotina')) ||
            (Array.isArray(s.modalidadesEspeciais) &&
              s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'rotina')) ||
            (Array.isArray(s.specialties) &&
              s.specialties.some((m) => normalizeStr(m) === 'rotina')) ||
            Boolean((s as any).activity && normalizeStr((s as any).activity) === 'rotina') ||
            (!s.activities || s.activities.length === 0);
          if (!hasRot) return false;
        } else {
          const hasAct =
            Array.isArray(s.activities) &&
            s.activities.some((act) => normalizeStr(act) === normalizeStr(nominalFilterSpecialty));
          const hasSpec =
            (Array.isArray(s.modalidadesEspeciais) &&
              s.modalidadesEspeciais.some((m) => normalizeStr(m) === normalizeStr(nominalFilterSpecialty))) ||
            (Array.isArray(s.specialties) &&
              s.specialties.some((m) => normalizeStr(m) === normalizeStr(nominalFilterSpecialty)));
          if (!hasAct && !hasSpec) return false;
        }
      }

      return true;
    });

    // 2. Avaliação de Esperado vs. Presença para cada aluno
    const evaluated: NominalProcessedStudent[] = candidateStudents.map((s) => {
      let isExpected = false;
      let hasPresence = false;
      let pCount = 0;
      let aCount = 0;

      if (periodMode === 'dia') {
        const target = selectedDate || todayStr;
        const isScheduled = isStudentScheduledForDate(s, target);
        const dayRecords = recs.filter((r) => r.studentId === s.id && r.date === target);

        pCount = dayRecords.filter((r) => {
          const norm = normalizeAttendanceStatus(r.status);
          return norm === 'presente' || norm === 'sem_equipamento' || norm === 'saida_antecipada';
        }).length;

        aCount = dayRecords.filter((r) => normalizeAttendanceStatus(r.status) === 'falta').length;
        hasPresence = pCount > 0;
        // Esperado se estava na grade OU se compareceu na chamada
        isExpected = isScheduled || hasPresence;
      } else {
        const sDate = startDate <= endDate ? startDate : endDate;
        const eDate = startDate <= endDate ? endDate : startDate;
        const isScheduled = isStudentScheduledInPeriod(s, sDate, eDate);
        const periodRecords = recs.filter((r) => r.studentId === s.id && r.date >= sDate && r.date <= eDate);

        pCount = periodRecords.filter((r) => {
          const norm = normalizeAttendanceStatus(r.status);
          return norm === 'presente' || norm === 'sem_equipamento' || norm === 'saida_antecipada';
        }).length;

        aCount = periodRecords.filter((r) => normalizeAttendanceStatus(r.status) === 'falta').length;
        hasPresence = pCount > 0;
        isExpected = isScheduled || hasPresence;
      }

      const dayOfWeekKey = (
        periodMode === 'dia' ? getDayOfWeekFromDate(selectedDate) : 'segunda'
      ) as DayOfWeek;

      const departureTime =
        s.horariosSaida && s.horariosSaida[dayOfWeekKey]
          ? s.horariosSaida[dayOfWeekKey]
          : s.horarioSaida || '18:00';

      return {
        student: s,
        status: hasPresence ? ('presente' as const) : ('faltoso' as const),
        tipo: s.tipoContrato === 'avulso' ? ('avulso' as const) : ('regular' as const),
        presenceCount: pCount,
        absenceCount: aCount,
        isExpected,
        departureTime,
      };
    });

    // 3. Alunos considerados esperados no universo filtrado
    const expectedList = evaluated.filter((item) => item.isExpected);

    // 4. Métricas / KPIs Globais
    const totalEsperados = expectedList.length;
    const totalPresentes = expectedList.filter((item) => item.status === 'presente').length;
    const totalFaltosos = expectedList.filter((item) => item.status === 'faltoso').length;
    const taxaPresenca = totalEsperados > 0 ? Math.round((totalPresentes / totalEsperados) * 100) : 0;
    const taxaFaltas = totalEsperados > 0 ? Math.round((totalFaltosos / totalEsperados) * 100) : 0;

    const calcMetrics: NominalReportMetrics = {
      totalEsperados,
      totalPresentes,
      totalFaltosos,
      taxaPresenca,
      taxaFaltas,
    };

    // 5. Filtragem final para exibição conforme attendanceFilter e busca nominal
    const filtered = expectedList
      .filter((item) => {
        if (attendanceFilter === 'presentes' && item.status !== 'presente') return false;
        if (attendanceFilter === 'faltosos' && item.status !== 'faltoso') return false;
        if (search && !normalizeStr(item.student.name).includes(search)) return false;
        return true;
      })
      .sort((a, b) => (a.student.name || '').localeCompare(b.student.name || '', 'pt-BR'));

    return {
      processedStudents: evaluated,
      expectedStudentsList: expectedList,
      metrics: calcMetrics,
      finalFilteredStudents: filtered,
    };
  }, [
    students,
    records,
    periodMode,
    selectedDate,
    startDate,
    endDate,
    studentTypeFilter,
    attendanceFilter,
    nominalFilterTurma,
    nominalFilterSpecialty,
    nominalSearchTerm,
    todayStr,
  ]);

  // Abertura do PDF com pré-visualização oficial
  const handleOpenPDFPreview = () => {
    const result = generateNominalListPDF({
      specialty: nominalFilterSpecialty,
      turma: nominalFilterTurma,
      students: students,
      records: records,
      currentUser: currentUser,
      attendanceFilter: attendanceFilter,
      studentTypeFilter: studentTypeFilter,
      periodMode: periodMode,
      targetDate: selectedDate,
      startDate: startDate,
      endDate: endDate,
      metrics: metrics,
      processedItems: finalFilteredStudents,
      anoLetivo: anoLetivo || 2026,
    });

    setPdfPreviewState({
      isOpen: true,
      doc: result.doc,
      dataUrl: result.dataUrl || result.dataUri,
      blobUrl: result.blobUrl,
      filename: result.filename,
      title: result.filename.replace('.pdf', ''),
      onDownload: result.download,
    });
  };

  // Download direto do PDF
  const handleDownloadPDFDirect = () => {
    generateNominalListPDF({
      specialty: nominalFilterSpecialty,
      turma: nominalFilterTurma,
      students: students,
      records: records,
      currentUser: currentUser,
      attendanceFilter: attendanceFilter,
      studentTypeFilter: studentTypeFilter,
      periodMode: periodMode,
      targetDate: selectedDate,
      startDate: startDate,
      endDate: endDate,
      metrics: metrics,
      processedItems: finalFilteredStudents,
      anoLetivo: anoLetivo || 2026,
      saveImmediately: true,
    });
  };

  if (!isOpen) return null;

  const selectedDayLabel = getDayOfWeekLabel(selectedDate);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-2 sm:p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header Institucional */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
                <BookMarked className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base sm:text-lg font-black tracking-wide text-white">
                    Relações Nominais de Presença e Faltas
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full">
                    Presentes vs. Faltosos
                  </span>
                  {anoLetivo && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded-full">
                      Exercício {anoLetivo}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Motor de relatórios nominais comparativo de alunos previstos vs. registros de chamada (Regulares e Avulsos)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Fechar janela"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Barra de Seleção de Filtros */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
            
            {/* Linha 1: Seleção de Período (Dia Específico vs Intervalo) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  Período:
                </span>

                {/* Seletor Segmentado de Modo */}
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPeriodMode('dia')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      periodMode === 'dia'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Data Específica / Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodMode('intervalo')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      periodMode === 'intervalo'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Mês / Intervalo
                  </button>
                </div>
              </div>

              {/* Controles de Data por Modo */}
              {periodMode === 'dia' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleShiftDay(-1)}
                    className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                    title="Dia Anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1">
                    <span className="text-[11px] font-bold text-slate-500">Data:</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      {selectedDayLabel}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleShiftDay(1)}
                    className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                    title="Próximo Dia"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    Hoje
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1">
                    <span className="text-[11px] font-bold text-slate-500">De:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2 py-0.5"
                    />
                    <span className="text-[11px] font-bold text-slate-500">Até:</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2 py-0.5"
                    />
                  </div>

                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => handleApplyPresetPeriod('mes')}
                      className="px-2 py-0.5 rounded hover:bg-white text-slate-700 text-[11px] font-bold"
                    >
                      Este Mês
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetPeriod('semana')}
                      className="px-2 py-0.5 rounded hover:bg-white text-slate-700 text-[11px] font-bold"
                    >
                      Esta Semana
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetPeriod('ultimos30')}
                      className="px-2 py-0.5 rounded hover:bg-white text-slate-700 text-[11px] font-bold"
                    >
                      Últimos 30d
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Linha 2: Filtros de Frequência, Tipo de Aluno, Turma e Busca */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
              
              {/* a) Status de Frequência */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide mb-1 flex items-center justify-between">
                  <span>Frequência:</span>
                  <span className="text-[10px] text-slate-400 font-semibold lowercase">
                    {attendanceFilter}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setAttendanceFilter('todos')}
                    className={`py-1 text-center rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      attendanceFilter === 'todos'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceFilter('presentes')}
                    className={`py-1 text-center rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                      attendanceFilter === 'presentes'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Presentes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceFilter('faltosos')}
                    className={`py-1 text-center rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                      attendanceFilter === 'faltosos'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Faltosos</span>
                  </button>
                </div>
              </div>

              {/* b) Tipo de Aluno */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide mb-1">
                  Tipo de Aluno:
                </label>
                <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setStudentTypeFilter('todos')}
                    className={`py-1 text-center rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      studentTypeFilter === 'todos'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentTypeFilter('regular')}
                    className={`py-1 text-center rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      studentTypeFilter === 'regular'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Regulares
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentTypeFilter('avulso')}
                    className={`py-1 text-center rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      studentTypeFilter === 'avulso'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    Avulsos
                  </button>
                </div>
              </div>

              {/* Turma */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide mb-1">
                  Turma:
                </label>
                <select
                  value={nominalFilterTurma}
                  onChange={(e) => setNominalFilterTurma(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="TODAS">Todas as Turmas ({students.length})</option>
                  {turmasList.map((t) => {
                    const count = students.filter(
                      (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && s.turma === t
                    ).length;
                    return (
                      <option key={t} value={t}>
                        {t} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Modalidade / Oficina */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide mb-1">
                  Modalidade:
                </label>
                <select
                  value={nominalFilterSpecialty}
                  onChange={(e) => setNominalFilterSpecialty(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="TODAS">Todas as Modalidades</option>
                  <option value="Rotina">Rotina Regular</option>
                  <option value="Reforço">⚡ Reforço Escolar (Paralelo)</option>
                  {extracurricularRollCallActivities
                    .filter((a) => a.id !== 'Reforço' && a.id !== 'Rotina')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || a.id}
                      </option>
                    ))}
                </select>
              </div>

              {/* Busca por Nome */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide mb-1">
                  Buscar Nome:
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={nominalSearchTerm}
                    onChange={(e) => setNominalSearchTerm(e.target.value)}
                    placeholder="Filtrar aluno..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder-slate-400"
                  />
                  {nominalSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setNominalSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* KPI Dashboard Strip: Total Esperados, Total Presentes, Total Faltosos */}
          <div className="px-4 py-3 bg-white border-b border-slate-200 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              
              {/* Card 1: Total Esperados */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex items-center space-x-3 shadow-2xs">
                <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Total Esperados
                  </span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-lg font-black text-slate-900 leading-none">
                      {metrics.totalEsperados}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">alunos</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Total Presentes */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-2.5 flex items-center space-x-3 shadow-2xs">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Total Presentes
                  </span>
                  <div className="flex items-baseline space-x-1.5">
                    <span className="text-lg font-black text-emerald-700 leading-none">
                      {metrics.totalPresentes}
                    </span>
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-md">
                      {metrics.taxaPresenca}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Total Faltosos / Ausentes */}
              <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-2.5 flex items-center space-x-3 shadow-2xs">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 block">
                    Total Faltosos
                  </span>
                  <div className="flex items-baseline space-x-1.5">
                    <span className="text-lg font-black text-rose-700 leading-none">
                      {metrics.totalFaltosos}
                    </span>
                    <span className="text-[10px] font-black text-rose-800 bg-rose-100 border border-rose-300 px-1.5 py-0.2 rounded-md">
                      {metrics.taxaFaltas}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Frequência Efetiva e Listados */}
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-2.5 flex items-center space-x-3 shadow-2xs">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                    Alunos Listados
                  </span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-lg font-black text-indigo-950 leading-none">
                      {finalFilteredStudents.length}
                    </span>
                    <span className="text-[10px] text-indigo-700 font-bold">
                      de {metrics.totalEsperados}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action and Export Controls Bar */}
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                Visualizando: {finalFilteredStudents.length} {finalFilteredStudents.length === 1 ? 'aluno' : 'alunos'}
              </span>

              {attendanceFilter !== 'todos' && (
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg border ${
                  attendanceFilter === 'presentes'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}>
                  {attendanceFilter === 'presentes' ? 'Filtro: Apenas Presentes' : 'Filtro: Apenas Faltosos'}
                </span>
              )}

              {studentTypeFilter !== 'todos' && (
                <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-lg">
                  {studentTypeFilter === 'regular' ? 'Apenas Regulares' : 'Apenas Avulsos'}
                </span>
              )}

              {nominalFilterTurma !== 'TODAS' && (
                <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  {nominalFilterTurma}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadPDFDirect}
                disabled={finalFilteredStudents.length === 0}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-40 transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                title="Baixar arquivo PDF com os KPIs e lista nominal"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar PDF</span>
              </button>

              <button
                type="button"
                onClick={handleOpenPDFPreview}
                disabled={finalFilteredStudents.length === 0}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center space-x-2"
                title="Visualizar e imprimir o relatório em PDF com layout oficial"
              >
                <FileText className="w-4 h-4" />
                <span>Visualizar / Imprimir PDF</span>
              </button>
            </div>
          </div>

          {/* Tabela Nominal Filtrada com Status de Frequência */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            {finalFilteredStudents.length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-3xl">
                <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Nenhum aluno encontrado</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Nenhum aluno atende aos filtros de frequência ({attendanceFilter}), tipo ({studentTypeFilter}) ou período selecionados.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white uppercase text-[10px] tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 font-bold text-center w-12">Nº</th>
                      <th className="py-2.5 px-4 font-bold">Nome do Aluno</th>
                      <th className="py-2.5 px-3 font-bold text-center">Tipo</th>
                      <th className="py-2.5 px-3 font-bold text-center">Turma</th>
                      <th className="py-2.5 px-3 font-bold text-center">Status Frequência</th>
                      <th className="py-2.5 px-3 font-bold text-center">Presenças / Detalhe</th>
                      <th className="py-2.5 px-3 font-bold text-center">Saída</th>
                      <th className="py-2.5 px-4 font-bold">Modalidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {finalFilteredStudents.map((item, idx) => {
                      const student = item.student;
                      const isAvulso = item.tipo === 'avulso';
                      const isPresent = item.status === 'presente';
                      const isReforco = Boolean(
                        (Array.isArray(student.modalidadesEspeciais) &&
                          student.modalidadesEspeciais.includes('Reforço')) ||
                          (Array.isArray(student.specialties) &&
                            student.specialties.includes('Reforço')) ||
                          (Array.isArray(student.activities) &&
                            student.activities.includes('Reforço'))
                      );

                      return (
                        <tr
                          key={student.id}
                          className={`transition-colors ${
                            isPresent ? 'hover:bg-emerald-50/30' : 'hover:bg-rose-50/30'
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-bold text-slate-500">
                            {String(idx + 1).padStart(2, '0')}
                          </td>

                          <td className="py-2 px-4 font-bold text-slate-900">
                            <div className="flex items-center space-x-2">
                              <span>{student.name}</span>
                              {isReforco && (
                                <span className="text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded">
                                  Reforço
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2 px-3 text-center">
                            {isAvulso ? (
                              <span className="text-[10px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                                Avulso
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                Regular
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center text-slate-700 font-semibold">
                            {student.turma}
                          </td>

                          <td className="py-2 px-3 text-center">
                            {isPresent ? (
                              <span className="inline-flex items-center space-x-1 text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-lg shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Presente</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-xs font-black text-rose-800 bg-rose-100 border border-rose-300 px-2.5 py-0.5 rounded-lg shadow-2xs">
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Faltoso / Ausente</span>
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center font-semibold text-slate-700">
                            {isPresent ? (
                              <span className="text-emerald-700 font-bold">
                                {item.presenceCount === 1 ? '1 presença' : `${item.presenceCount} presenças`}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-[11px]">
                                {item.absenceCount > 0 ? `${item.absenceCount} falta anotada` : 'Sem presença'}
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center font-bold text-slate-800">
                            {item.departureTime}
                          </td>

                          <td className="py-2 px-4 text-slate-600">
                            <div className="flex flex-wrap gap-1 items-center">
                              {(student.activities || []).map((act) => (
                                <span
                                  key={act}
                                  className="bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                >
                                  {act}
                                </span>
                              ))}
                              {(!student.activities || student.activities.length === 0) && (
                                <span className="text-slate-400 italic text-[10.5px]">
                                  Rotina
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer Informativo */}
          <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 shrink-0">
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <strong>Presente:</strong> Aluno com ao menos 1 registro de presença na data/período.
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <strong>Faltoso:</strong> Aluno previsto sem registro de presença na data/período.
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer shadow-2xs ml-auto"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* On-screen PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfPreviewState.isOpen}
        onClose={() => setPdfPreviewState((prev) => ({ ...prev, isOpen: false }))}
        doc={pdfPreviewState.doc}
        dataUrl={pdfPreviewState.dataUrl}
        pdfDataUrl={pdfPreviewState.dataUrl}
        blobUrl={pdfPreviewState.blobUrl}
        filename={pdfPreviewState.filename}
        title={pdfPreviewState.title}
        onDownload={pdfPreviewState.onDownload}
      />
    </>
  );
};

export default NominalListModal;
