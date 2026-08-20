import React, { useState, useMemo } from 'react';
import {
  Student,
  AttendanceRecord,
  ActivityType,
  TurmaType,
  WeekInfo,
  ActivityItem,
  UserProfile,
  HolidayItem,
} from '../types';
import { ACTIVITIES_LIST, TURMAS_LIST } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import {
  generateStudentPeriodPDFReport,
  generateTurmaConsolidatedPeriodPDFReport,
  generateActivityModalityPeriodPDFReport,
  generateStudentPDFReport,
  generateTurmaPDFReport,
} from '../utils/pdfGenerator';
import { formatDateBR, getDayOfWeekFromDate, getDayOfWeekLabel, getEffectiveSchoolDays } from '../utils/dateUtils';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import {
  BarChart3,
  Printer,
  Download,
  Shirt,
  CheckCircle2,
  XCircle,
  Stethoscope,
  AlertTriangle,
  Copy,
  Check,
  FileSpreadsheet,
  FileText,
  UserCheck,
  Users,
  Clock,
  Calendar,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Award,
  CalendarOff,
  Info,
} from 'lucide-react';

interface WeeklyReportProps {
  students: Student[];
  records: AttendanceRecord[];
  turmas?: string[];
  activitiesList?: ActivityItem[];
  holidays?: HolidayItem[];
  currentWeek: WeekInfo;
  currentUser?: UserProfile | null;
  users?: UserProfile[];
  onDeleteTurma?: (turmaName: string, deleteStudents: boolean, targetTurmaToReassign?: string) => void;
}

export const WeeklyReport: React.FC<WeeklyReportProps> = ({
  students,
  records,
  turmas,
  activitiesList = ACTIVITIES_LIST,
  holidays = [],
  currentWeek,
  currentUser,
  users = [],
  onDeleteTurma,
}) => {
  const isCoordenador = currentUser?.role === 'coordenador';
  const userAssignedTurmas = useMemo(
    () => currentUser?.allowedClassIds || currentUser?.assignedTurmas || [],
    [currentUser]
  );
  const userAssignedActivities = useMemo(
    () => currentUser?.assignedActivities || [],
    [currentUser]
  );

  const turmasList = useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    const sorted = sortTurmasPedagogical(rawList);
    if (isCoordenador || !currentUser) return sorted;
    const userTurmaSet = new Set(userAssignedTurmas);
    return sorted.filter((t) => userTurmaSet.has(t));
  }, [turmas, isCoordenador, currentUser, userAssignedTurmas]);

  const activeActivities = useMemo(() => {
    const rawList = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
    const rollCallOnly = rawList.filter((act) => act.requiresRollCall !== false);
    if (isCoordenador || !currentUser) return rollCallOnly;
    return rollCallOnly.filter((act) => userAssignedActivities.includes(act.id));
  }, [activitiesList, isCoordenador, currentUser, userAssignedActivities]);

  const allowedActivityIds = useMemo(() => activeActivities.map((a) => a.id), [activeActivities]);

  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityItem>();
    const rawList = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
    rawList.forEach((item) => {
      map.set(item.id, item);
      map.set(item.name, item);
    });
    return map;
  }, [activitiesList]);

  const sortedStudentsForPdf = useMemo(() => {
    const rawStudents = students || [];
    const list =
      isCoordenador || !currentUser
        ? rawStudents
        : rawStudents.filter((s) => s && turmasList.includes(s.turma));
    return [...list].sort((a, b) => {
      const turmaCompare = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
      if (turmaCompare !== 0) return turmaCompare;
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });
  }, [students, isCoordenador, currentUser, turmasList]);

  // -------------------------------------------------------------------------
  // Filtering Mode State: Por Semana vs Por Período Personalizado
  // -------------------------------------------------------------------------
  const [filterMode, setFilterMode] = useState<'week' | 'period'>('week');
  const [periodStartDate, setPeriodStartDate] = useState<string>(currentWeek.startDate);
  const [periodEndDate, setPeriodEndDate] = useState<string>(currentWeek.endDate);
  const [activePreset, setActivePreset] = useState<'week' | 'month' | 'last30' | 'year' | 'custom'>('week');

  // Preset Date Range Applicator
  const applyPreset = (preset: 'week' | 'month' | 'last30' | 'year') => {
    setActivePreset(preset);
    const now = new Date();

    if (preset === 'week') {
      setPeriodStartDate(currentWeek.startDate);
      setPeriodEndDate(currentWeek.endDate);
      setFilterMode('week');
    } else if (preset === 'month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const start = `${year}-${month}-01`;
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      setPeriodStartDate(start);
      setPeriodEndDate(end);
      setFilterMode('period');
    } else if (preset === 'last30') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const start = past.toISOString().split('T')[0];
      const end = now.toISOString().split('T')[0];
      setPeriodStartDate(start);
      setPeriodEndDate(end);
      setFilterMode('period');
    } else if (preset === 'year') {
      const year = now.getFullYear();
      setPeriodStartDate(`${year}-01-01`);
      setPeriodEndDate(`${year}-12-31`);
      setFilterMode('period');
    }
  };

  // Effective Active Range
  const effectiveStartDate = filterMode === 'week' ? currentWeek.startDate : periodStartDate;
  const effectiveEndDate = filterMode === 'week' ? currentWeek.endDate : periodEndDate;
  const effectivePeriodLabel =
    filterMode === 'week'
      ? currentWeek.label
      : `Período de ${formatDateBR(effectiveStartDate)} a ${formatDateBR(effectiveEndDate)}`;

  // Effective School Days Calculation (excluding weekends and registered holidays/recesses)
  const schoolDaysInfo = useMemo(() => {
    return getEffectiveSchoolDays(effectiveStartDate, effectiveEndDate, holidays);
  }, [effectiveStartDate, effectiveEndDate, holidays]);

  // Filter records according to active range and user roles
  const activeRecords = useMemo(() => {
    return records.filter((r) => {
      // Date range filter
      if (filterMode === 'week') {
        const isThisWeek = r.weekNumber === currentWeek.weekNumber && r.year === currentWeek.year;
        if (!isThisWeek) return false;
      } else {
        if (!r.date || r.date < effectiveStartDate || r.date > effectiveEndDate) return false;
      }

      // Role check
      if (!isCoordenador && currentUser) {
        if (!turmasList.includes(r.turma)) return false;
        if (!allowedActivityIds.includes(r.activity as ActivityType)) return false;
      }
      return true;
    });
  }, [
    records,
    filterMode,
    currentWeek,
    effectiveStartDate,
    effectiveEndDate,
    isCoordenador,
    currentUser,
    turmasList,
    allowedActivityIds,
  ]);

  // Overall Statistics
  const totalRecords = activeRecords.length;
  const presenteCount = activeRecords.filter((r) => r.status === 'presente').length;
  const saidaAntecipadaCount = activeRecords.filter((r) => r.status === 'saida_antecipada').length;
  const faltaCount = activeRecords.filter((r) => r.status === 'falta').length;
  const saudeCount = activeRecords.filter((r) => r.status === 'saude').length;
  const semEquipamentoCount = activeRecords.filter((r) => r.status === 'sem_equipamento').length;

  const validPresences = presenteCount + saidaAntecipadaCount;
  const presenceRate = totalRecords > 0 ? Math.round((validPresences / totalRecords) * 100) : 0;
  const equipmentRecords = activeRecords.filter((r) => r.status === 'sem_equipamento');

  // Stats per activity
  const activityStats = useMemo(() => {
    return activeActivities.map((act) => {
      const actRecords = activeRecords.filter((r) => r.activity === act.id);
      const total = actRecords.length;
      const pres = actRecords.filter((r) => r.status === 'presente').length;
      const saidaAnt = actRecords.filter((r) => r.status === 'saida_antecipada').length;
      const falta = actRecords.filter((r) => r.status === 'falta').length;
      const saude = actRecords.filter((r) => r.status === 'saude').length;
      const semEquip = actRecords.filter((r) => r.status === 'sem_equipamento').length;
      const rate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 0;

      return {
        activity: act.id,
        total,
        pres,
        saidaAnt,
        falta,
        saude,
        semEquip,
        rate,
      };
    });
  }, [activeActivities, activeRecords]);

  // Stats per turma
  const turmaStats = useMemo(() => {
    return turmasList.map((turma) => {
      const turmaStudents = students.filter((s) => s.turma === turma);
      const studentIdsInTurma = new Set(turmaStudents.map((s) => s.id));
      const turmaRecords = activeRecords.filter(
        (r) => r.turma === turma || studentIdsInTurma.has(r.studentId)
      );
      const total = turmaRecords.length;
      const pres = turmaRecords.filter((r) => r.status === 'presente').length;
      const saidaAnt = turmaRecords.filter((r) => r.status === 'saida_antecipada').length;
      const falta = turmaRecords.filter((r) => r.status === 'falta').length;
      const saude = turmaRecords.filter((r) => r.status === 'saude').length;
      const semEquip = turmaRecords.filter((r) => r.status === 'sem_equipamento').length;
      const rate = total > 0 ? Math.round(((pres + saidaAnt) / total) * 100) : 0;

      return {
        turma,
        total,
        pres,
        saidaAnt,
        falta,
        saude,
        semEquip,
        rate,
      };
    });
  }, [turmasList, students, activeRecords]);

  // -------------------------------------------------------------------------
  // Modals & PDF Export State
  // -------------------------------------------------------------------------
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 1. Student PDF Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [selectedPdfStudentId, setSelectedPdfStudentId] = useState<string>(
    sortedStudentsForPdf[0]?.id || ''
  );
  const [pdfStudentStartDate, setPdfStudentStartDate] = useState<string>(effectiveStartDate);
  const [pdfStudentEndDate, setPdfStudentEndDate] = useState<string>(effectiveEndDate);

  // 2. Turma PDF Modal State
  const [showTurmaModal, setShowTurmaModal] = useState(false);
  const [selectedPdfTurma, setSelectedPdfTurma] = useState<TurmaType>(turmasList[0] || '1º Ano Azul');
  const [pdfTurmaStartDate, setPdfTurmaStartDate] = useState<string>(effectiveStartDate);
  const [pdfTurmaEndDate, setPdfTurmaEndDate] = useState<string>(effectiveEndDate);

  // Helper to find the registered Specialist Teacher full name assigned to an activity/modality
  const getSpecialistTeacherForActivity = (
    activityId: string,
    usersList: UserProfile[] = [],
    currentUserProfile?: UserProfile | null
  ): string => {
    if (!activityId) return '';
    const normAct = activityId.trim().toLowerCase();
    const normActNoAccent = normAct.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Search non-coordinator teachers/monitors who have this activity assigned in their profile
    const specialist = usersList.find((u) => {
      if (!u || u.role === 'coordenador') return false;
      const acts = u.assignedActivities || [];
      const hasInAssigned = acts.some((a) => {
        if (!a) return false;
        const aNorm = a.trim().toLowerCase();
        const aNormNoAccent = aNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return aNorm === normAct || aNormNoAccent === normActNoAccent;
      });
      const hasInSpecialty =
        u.specialtyActivity &&
        (u.specialtyActivity.trim().toLowerCase() === normAct ||
          u.specialtyActivity.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normActNoAccent);

      return hasInAssigned || hasInSpecialty;
    });

    if (specialist && specialist.name) {
      return specialist.name.trim();
    }

    // 2. Search any user (including other staff) who has this activity assigned
    const anyUser = usersList.find((u) => {
      if (!u) return false;
      const acts = u.assignedActivities || [];
      const hasInAssigned = acts.some((a) => {
        if (!a) return false;
        const aNorm = a.trim().toLowerCase();
        const aNormNoAccent = aNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return aNorm === normAct || aNormNoAccent === normActNoAccent;
      });
      const hasInSpecialty =
        u.specialtyActivity &&
        (u.specialtyActivity.trim().toLowerCase() === normAct ||
          u.specialtyActivity.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normActNoAccent);

      return hasInAssigned || hasInSpecialty;
    });

    if (anyUser && anyUser.name) {
      return anyUser.name.trim();
    }

    // 3. Fallback: If current user is a teacher assigned to this activity
    if (currentUserProfile && currentUserProfile.role !== 'coordenador') {
      const userActs = currentUserProfile.assignedActivities || [];
      const hasInAssigned = userActs.some((a) => {
        if (!a) return false;
        const aNorm = a.trim().toLowerCase();
        const aNormNoAccent = aNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return aNorm === normAct || aNormNoAccent === normActNoAccent;
      });
      if (hasInAssigned && currentUserProfile.name) {
        return currentUserProfile.name.trim();
      }
    }

    return '';
  };

  // 3. Modality/Oficina PDF Modal State
  const [showModalityModal, setShowModalityModal] = useState(false);
  const [selectedPdfModality, setSelectedPdfModality] = useState<ActivityType>(
    activeActivities[0]?.id || 'Natação'
  );
  const [pdfModalityTeacher, setPdfModalityTeacher] = useState<string>(() => {
    const initialMod = activeActivities[0]?.id || 'Natação';
    const found = getSpecialistTeacherForActivity(initialMod, users, currentUser);
    return found || (currentUser?.role === 'professor' ? currentUser.name : '');
  });
  const [pdfModalityStartDate, setPdfModalityStartDate] = useState<string>(effectiveStartDate);
  const [pdfModalityEndDate, setPdfModalityEndDate] = useState<string>(effectiveEndDate);

  // Quick Open Modal Handlers
  const handleOpenStudentModal = (studentId?: string) => {
    if (studentId) setSelectedPdfStudentId(studentId);
    setPdfStudentStartDate(effectiveStartDate);
    setPdfStudentEndDate(effectiveEndDate);
    setShowStudentModal(true);
  };

  const handleOpenTurmaModal = (turma?: TurmaType) => {
    if (turma) setSelectedPdfTurma(turma);
    setPdfTurmaStartDate(effectiveStartDate);
    setPdfTurmaEndDate(effectiveEndDate);
    setShowTurmaModal(true);
  };

  const handleOpenModalityModal = (modality?: ActivityType) => {
    const targetModality = modality || selectedPdfModality || activeActivities[0]?.id || 'Natação';
    setSelectedPdfModality(targetModality);
    const teacherFound = getSpecialistTeacherForActivity(targetModality, users, currentUser);
    setPdfModalityTeacher(teacherFound || (currentUser?.role === 'professor' ? currentUser.name : ''));
    setPdfModalityStartDate(effectiveStartDate);
    setPdfModalityEndDate(effectiveEndDate);
    setShowModalityModal(true);
  };

  // Printing & CSV
  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    let csv = 'Data,DiaSemana,Semana,Aluno,Turma,Atividade,Status,HorarioSaida,EquipamentoFaltante,Observacao\n';

    activeRecords.forEach((r) => {
      const st = students.find((s) => s.id === r.studentId);
      const studentName = st ? st.name : 'Aluno';
      const dayOfWeekKey = getDayOfWeekFromDate(r.date);
      const dayOfWeekStr = dayOfWeekKey ? getDayOfWeekLabel(dayOfWeekKey) : '';
      csv += `"${r.date}","${dayOfWeekStr}","${r.weekNumber}","${studentName}","${r.turma}","${
        r.activity
      }","${r.status}","${r.exitTime || ''}","${r.equipmentMissingDetails || ''}","${
        r.observation || ''
      }"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Frequencia_Integral_${effectiveStartDate}_a_${effectiveEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyNotificationText = (rec: AttendanceRecord) => {
    const student = students.find((s) => s.id === rec.studentId);
    const studentName = student ? student.name : 'Aluno';
    const text = `Prezados responsáveis pelo(a) aluno(a) ${studentName} (${rec.turma}):\nInformamos que na atividade de ${rec.activity} do Integral realizada no dia ${formatDateBR(
      rec.date
    )}, o(a) aluno(a) esteve impossibilitado(a) de participar devido a: ${
      rec.equipmentMissingDetails || 'falta de uniforme/equipamento necessário'
    }.\nSolicitamos a gentileza de verificar o material no próximo dia da atividade.\nAtenciosamente, Coordenação do Integral.`;

    navigator.clipboard.writeText(text);
    setCopiedId(rec.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Top Header & Period Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 print:hidden">
        {/* Header line + Title */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Relatórios de Frequência
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {totalRecords} apontamentos computados
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
              Painel de Desempenho e Frequência do Integral
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualize estatísticas consolidadas e gere relatórios oficiais em PDF com cabeçalho do Colégio Crescer.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenStudentModal()}
              className="px-3.5 py-2 rounded-2xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs transition-all cursor-pointer flex items-center space-x-1.5"
              title="Gerar PDF do Histórico Individual do Aluno"
            >
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>PDF Aluno</span>
            </button>

            <button
              onClick={() => handleOpenTurmaModal()}
              className="px-3.5 py-2 rounded-2xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-all cursor-pointer flex items-center space-x-1.5"
              title="Gerar PDF da Matriz Consolidada da Turma"
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>PDF Turma</span>
            </button>

            <button
              onClick={() => handleOpenModalityModal()}
              className="px-3.5 py-2 rounded-2xl text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 shadow-2xs transition-all cursor-pointer flex items-center space-x-1.5"
              title="Gerar PDF para Professores Especialistas de Oficinas"
            >
              <Award className="w-4 h-4 text-violet-600" />
              <span>PDF Oficina</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-2xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1"
              title="Exportar dados brutos em planilha CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-2 rounded-2xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all cursor-pointer flex items-center space-x-1"
              title="Imprimir visualização atual"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Date Filter & Presets Row */}
        <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Presets buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Período:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('week')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'week' && filterMode === 'week'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Semana Atual ({currentWeek.weekNumber})
            </button>
            <button
              type="button"
              onClick={() => applyPreset('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'month' && filterMode === 'period'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last30')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'last30' && filterMode === 'period'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Últimos 30 Dias
            </button>
            <button
              type="button"
              onClick={() => applyPreset('year')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activePreset === 'year' && filterMode === 'period'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Ano Letivo
            </button>
          </div>

          {/* Custom Date Pickers */}
          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">De:</span>
            <input
              type="date"
              value={periodStartDate}
              onChange={(e) => {
                setPeriodStartDate(e.target.value);
                setFilterMode('period');
                setActivePreset('custom');
              }}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[11px] font-bold text-slate-500 uppercase">Até:</span>
            <input
              type="date"
              value={periodEndDate}
              onChange={(e) => {
                setPeriodEndDate(e.target.value);
                setFilterMode('period');
                setActivePreset('custom');
              }}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Effective School Days & Holiday Notice Strip */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                {schoolDaysInfo.effectiveDaysCount}{' '}
                {schoolDaysInfo.effectiveDaysCount === 1 ? 'Dia Útil Letivo' : 'Dias Úteis Letivos'}
              </span>
            </span>
            <span className="text-slate-500 text-[11px]">
              (Desconsiderados fins de semana e feriados/recessos cadastrados)
            </span>
          </div>

          {schoolDaysInfo.holidaysCount > 0 && (
            <div className="flex items-center space-x-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200 text-[11px] font-bold">
              <CalendarOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>
                {schoolDaysInfo.holidaysCount}{' '}
                {schoolDaysInfo.holidaysCount === 1 ? 'feriado/recesso descontado' : 'feriados/recessos descontados'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Card 1: Presença Geral */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
              Taxa de Presença
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-900">{presenceRate}%</span>
            <span className="text-xs text-emerald-700 font-bold">
              ({validPresences} presenças)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total de chamadas: {totalRecords}</p>
        </div>

        {/* Card 2: Saída Antecipada */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
              Saída Antecipada
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5 text-amber-700" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-amber-900">{saidaAntecipadaCount}</span>
            <span className="text-xs text-amber-800 font-bold">ocorrências</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Horário de saída registrado</p>
        </div>

        {/* Card 3: Falta de Equipamento */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
              Sem Material / Equip.
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center font-bold">
              <Shirt className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-orange-900">{semEquipamentoCount}</span>
            <span className="text-xs text-orange-800 font-bold">ocorrências</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Maiô, kimono, flauta, tênis...</p>
        </div>

        {/* Card 4: Ausências por Saúde */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
              Ausência Saúde
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Stethoscope className="w-5 h-5 text-amber-700" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-amber-900">{saudeCount}</span>
            <span className="text-xs text-amber-800 font-bold">justificadas</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Atestados e indisposições</p>
        </div>

        {/* Card 5: Faltas Não Justificadas */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
              Faltas Gerais
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-rose-900">{faltaCount}</span>
            <span className="text-xs text-rose-700 font-bold">ausências</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Faltas não justificadas</p>
        </div>
      </div>

      {/* Equipment Alerts Banner */}
      {equipmentRecords.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <h3 className="font-extrabold text-sm">
                Avisos para Envio aos Responsáveis (Alunos sem Equipamento/Uniforme)
              </h3>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-200">
              {equipmentRecords.length} pendências no período
            </span>
          </div>

          <div className="space-y-2">
            {equipmentRecords.map((rec) => {
              const student = students.find((s) => s.id === rec.studentId);
              const isCopied = copiedId === rec.id;

              return (
                <div
                  key={rec.id}
                  className="bg-white border border-amber-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-slate-900">{student?.name || 'Aluno'}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-slate-600">{rec.turma}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-bold text-indigo-600">{rec.activity}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{formatDateBR(rec.date)}</span>
                    </div>
                    <div className="text-amber-800 font-semibold flex items-center space-x-1">
                      <Shirt className="w-3.5 h-3.5 text-orange-600 inline mr-1" />
                      <span>Item faltante: {rec.equipmentMissingDetails || 'Não especificado'}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleOpenStudentModal(rec.studentId)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 font-bold transition-all cursor-pointer flex items-center space-x-1"
                      title="Gerar PDF individual deste aluno"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>PDF</span>
                    </button>

                    <button
                      onClick={() => copyNotificationText(rec)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs'
                      }`}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Copiado!' : 'Copiar Comunicado'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Frequência por Modalidade / Oficina (Professores Especialistas) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              Frequência por Modalidade / Oficina (Para Professores Especialistas)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento de aproveitamento e emissão de listas de chamada para docentes de oficinas extracurriculares.
            </p>
          </div>
          <button
            onClick={() => handleOpenModalityModal()}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Exportar PDF de Oficina</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-700 font-extrabold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Modalidade / Oficina</th>
                <th className="px-4 py-3 text-center">Chamadas</th>
                <th className="px-4 py-3 text-center text-emerald-700">Presenças (Taxa)</th>
                <th className="px-4 py-3 text-center text-amber-800">Saída Antecipada</th>
                <th className="px-4 py-3 text-center text-orange-800">Sem Equipamento</th>
                <th className="px-4 py-3 text-center text-amber-800">Saúde</th>
                <th className="px-4 py-3 text-center text-rose-700">Faltas</th>
                <th className="px-4 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activityStats.map((stat) => {
                const actMeta = activityMap.get(stat.activity);
                return (
                <tr key={stat.activity} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center space-x-2">
                    <ActivityBadge
                      activity={stat.activity}
                      iconName={actMeta?.icon}
                      customIconUrl={actMeta?.customIconUrl}
                      customEquipment={actMeta?.defaultEquipment}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-700">{stat.total}</td>
                  <td className="px-4 py-3 text-center font-extrabold text-emerald-700">
                    {stat.pres + stat.saidaAnt} ({stat.rate}%)
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-amber-800">
                    {stat.saidaAnt}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-orange-800">
                    {stat.semEquip}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-amber-800">
                    {stat.saude}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-rose-700">
                    {stat.falta}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleOpenModalityModal(stat.activity as ActivityType)}
                      className="px-2.5 py-1 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all cursor-pointer inline-flex items-center space-x-1"
                      title="Gerar PDF oficial desta oficina"
                    >
                      <Download className="w-3 h-3 text-violet-600" />
                      <span>PDF Oficina</span>
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section: Frequência Consolidada por Turma */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Frequência Consolidada por Turma (Ano Escolar)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Matriz comparativa de presença e taxa de aproveitamento pedagógico por turma.
            </p>
          </div>
          <button
            onClick={() => handleOpenTurmaModal()}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Exportar PDF por Turma</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-700 font-extrabold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Turma / Segmento</th>
                <th className="px-4 py-3 text-center">Total Chamadas</th>
                <th className="px-4 py-3 text-center text-emerald-700">Presenças (Taxa)</th>
                <th className="px-4 py-3 text-center text-amber-800">Saída Antecipada</th>
                <th className="px-4 py-3 text-center text-orange-800">Sem Equipamento</th>
                <th className="px-4 py-3 text-center text-amber-800">Saúde</th>
                <th className="px-4 py-3 text-center text-rose-700">Faltas</th>
                <th className="px-4 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {turmaStats.map((stat) => (
                <tr key={stat.turma} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{stat.turma}</td>
                  <td className="px-4 py-3 text-center font-semibold">{stat.total}</td>
                  <td className="px-4 py-3 text-center font-extrabold text-emerald-700">
                    {stat.pres + stat.saidaAnt} ({stat.rate}%)
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-amber-800">
                    {stat.saidaAnt}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-orange-800">
                    {stat.semEquip}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-amber-800">
                    {stat.saude}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-rose-700">
                    {stat.falta}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => {
                        generateTurmaConsolidatedPeriodPDFReport({
                          turma: stat.turma as TurmaType,
                          startDate: effectiveStartDate,
                          endDate: effectiveEndDate,
                          periodLabel: effectivePeriodLabel,
                          students,
                          records,
                        });
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer inline-flex items-center space-x-1"
                      title="Baixar PDF consolidado desta turma"
                    >
                      <Download className="w-3 h-3 text-indigo-600" />
                      <span>PDF Turma</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODALS DE EXPORTAÇÃO EM PDF
          ========================================================================= */}

      {/* 1. Modal: Download Turma PDF */}
      {showTurmaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Relatório Consolidado da Turma
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Matriz de presença de todos os alunos no período • Colégio Crescer
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Turma Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Selecione a Turma / Ano Escolar:
                </label>
                <select
                  value={selectedPdfTurma}
                  onChange={(e) => setSelectedPdfTurma(e.target.value as TurmaType)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
                >
                  {turmasList.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Period Range Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Período do Relatório:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Data Inicial:</span>
                    <input
                      type="date"
                      value={pdfTurmaStartDate}
                      onChange={(e) => setPdfTurmaStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Data Final:</span>
                    <input
                      type="date"
                      value={pdfTurmaEndDate}
                      onChange={(e) => setPdfTurmaEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-800">Estrutura do Documento:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px]">
                  <li>Cabeçalho oficial com carimbo de emissão</li>
                  <li>Lista com todos os alunos matriculados na turma</li>
                  <li>Contagem de presenças, saídas antecipadas, faltas e % de frequência</li>
                  <li>Campo para assinatura da monitora e coordenação</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowTurmaModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  generateTurmaConsolidatedPeriodPDFReport({
                    turma: selectedPdfTurma,
                    startDate: pdfTurmaStartDate,
                    endDate: pdfTurmaEndDate,
                    periodLabel: `De ${formatDateBR(pdfTurmaStartDate)} a ${formatDateBR(pdfTurmaEndDate)}`,
                    students,
                    records,
                  });
                  setShowTurmaModal(false);
                }}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Gerar PDF da Turma</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Download Student PDF */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between border-b border-blue-900/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Relatório Individual do Aluno
                  </h3>
                  <p className="text-xs text-blue-200">
                    Histórico detalhado de presenças, faltas e ocorrências • Colégio Crescer
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Student Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Selecione o Aluno(a):
                </label>
                <select
                  value={selectedPdfStudentId}
                  onChange={(e) => setSelectedPdfStudentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500"
                >
                  {sortedStudentsForPdf.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.turma})
                    </option>
                  ))}
                </select>
              </div>

              {/* Period Range Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Período do Relatório:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Data Inicial:</span>
                    <input
                      type="date"
                      value={pdfStudentStartDate}
                      onChange={(e) => setPdfStudentStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Data Final:</span>
                    <input
                      type="date"
                      value={pdfStudentEndDate}
                      onChange={(e) => setPdfStudentEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-800">Conteúdo do PDF Individual:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px]">
                  <li>Histórico cronológico de cada dia e oficina</li>
                  <li>Percentual de assiduidade / taxa de presença</li>
                  <li>Relato de faltas de uniforme/equipamento e avisos</li>
                  <li>Campo para ciência e assinatura dos responsáveis</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetStudent = students.find((s) => s.id === selectedPdfStudentId);
                  if (targetStudent) {
                    generateStudentPeriodPDFReport({
                      student: targetStudent,
                      startDate: pdfStudentStartDate,
                      endDate: pdfStudentEndDate,
                      periodLabel: `De ${formatDateBR(pdfStudentStartDate)} a ${formatDateBR(pdfStudentEndDate)}`,
                      records,
                    });
                  }
                  setShowStudentModal(false);
                }}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Gerar PDF do Aluno</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Download Modality / Oficina PDF (Professores Especialistas) */}
      {showModalityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-violet-950 to-slate-900 text-white flex items-center justify-between border-b border-violet-900/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Relatório por Modalidade / Oficina
                  </h3>
                  <p className="text-xs text-violet-200">
                    Lista de presença para professores especialistas • Colégio Crescer
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Modality Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Modalidade / Oficina:
                </label>
                <select
                  value={selectedPdfModality}
                  onChange={(e) => {
                    const newModality = e.target.value as ActivityType;
                    setSelectedPdfModality(newModality);
                    const foundTeacher = getSpecialistTeacherForActivity(newModality, users, currentUser);
                    setPdfModalityTeacher(foundTeacher || (currentUser?.role === 'professor' ? currentUser.name : ''));
                  }}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:ring-2 focus:ring-violet-500 focus:outline-none"
                >
                  {activeActivities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher Name */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Professor(a) Especialista:
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {pdfModalityTeacher ? 'Auto-preenchido • Editável' : 'Campo editável'}
                  </span>
                </div>
                <input
                  type="text"
                  value={pdfModalityTeacher}
                  onChange={(e) => setPdfModalityTeacher(e.target.value)}
                  placeholder="Nome do docente responsável pela oficina"
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Carregado automaticamente a partir do perfil do usuário cadastrado na modalidade. Pode ser alterado livremente antes da impressão.
                </p>
              </div>

              {/* Period Range Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Período do Relatório:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Data Inicial:</span>
                    <input
                      type="date"
                      value={pdfModalityStartDate}
                      onChange={(e) => setPdfModalityStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Data Final:</span>
                    <input
                      type="date"
                      value={pdfModalityEndDate}
                      onChange={(e) => setPdfModalityEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-800">Conteúdo do PDF para Especialistas:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px]">
                  <li>Alunos matriculados nesta oficina de todas as turmas</li>
                  <li>Total de aulas ministradas e presenças individuais</li>
                  <li>Controle de material faltante (maiô, kimono, flauta, etc.)</li>
                  <li>Campo para assinatura do professor especialista e coordenação</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowModalityModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  generateActivityModalityPeriodPDFReport({
                    activityName: selectedPdfModality,
                    startDate: pdfModalityStartDate,
                    endDate: pdfModalityEndDate,
                    periodLabel: `De ${formatDateBR(pdfModalityStartDate)} a ${formatDateBR(pdfModalityEndDate)}`,
                    students,
                    records,
                    teacherName: pdfModalityTeacher,
                  });
                  setShowModalityModal(false);
                }}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Gerar PDF da Oficina</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
