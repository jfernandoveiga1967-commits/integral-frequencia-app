import React, { useState, useEffect } from 'react';
import { Student, ActivityType, TurmaType, AttendanceRecord, WeekInfo, UserProfile, ActivityItem, DayOfWeek, StudentStatus, ContractType, PlanoContratualType, PLANOS_CONTRATUAIS_TABELA, PLANOS_CONTRATUAIS_2026, PLANOS_CONTRATUAIS_2027, getTabelaPlanosPorAno } from '../types';
import { TURMAS_LIST, ACTIVITIES_LIST, OFFICIAL_ROLL_CALL_MODALITIES } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { generateStudentPDFReport, generateTurmaPDFReport, generateFichaMatriculaPDF, generateTermoSaidaAvulsaPDF } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { RosterReportModal } from './RosterReportModal';
import { SaidaAvulsaModal } from './SaidaAvulsaModal';
import { canManageStudents, canManageTurmas } from '../utils/authUtils';
import { sortTurmasPedagogical, getNextAcademicTurma } from '../utils/turmaUtils';
import { formatDiasFrequencia, ALL_DAYS_OF_WEEK, toISODateString, formatDateBR, formatHorarioSaida, isStudentScheduledForDay } from '../utils/dateUtils';
import { formatCurrencyBR } from '../utils/pontoUtils';
import { Users, UserPlus, FileText, Trash2, Edit3, Check, X, Search, Sparkles, Download, Layers, Plus, Info, ArrowRightLeft, CheckCircle2, ShieldAlert, Loader2, Calendar, CalendarDays, CheckSquare, UserX, UserCheck, Power, AlertCircle, RotateCcw, Clock, BookMarked, Printer, Upload, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, School, FileCheck, Car, BadgeDollarSign, Eraser, TrendingUp, Filter, GraduationCap } from 'lucide-react';
import * as XLSX from 'xlsx';
import { writeBatch, doc } from 'firebase/firestore';
import { db, batchDeleteStudentsFromFirestore } from '../firebase';
import { saveStudents, loadStudents, normalizeStudent, PROTECTED_MINI_MATERNAL_2026_IDS } from '../utils/storageUtils';
import { broadcastSyncEvent } from '../services/syncService';
import { OFFICIAL_2027_BATCH_COUNT, audit2027Students, purgeSurplus2027Students, isStudentActive, reclassifyKlausTo4thYear } from '../services/studentService';
import {
  E1ExtractedStudent,
  readE1FileAsText,
  sanitizeE1String,
  mapE1TurmaNameToOfficial,
  parseE1HtmlReport,
  parseE1SheetRows,
  cleanMatriculaValue,
  isHeaderOrSystemText,
  isStudentNameCell,
  isNumericMatricula,
  normalizeStudentNameForMatching,
  generateDeterministicStudentId,
  getStudentIdentityKey,
  findDuplicateStudentGroups,
} from '../utils/e1Parser';

interface StudentManagerProps {
  students?: Student[];
  records?: AttendanceRecord[];
  turmas?: string[];
  activitiesList?: ActivityItem[];
  currentWeek?: WeekInfo;
  currentUser?: UserProfile | null;
  onAddStudent: (student: Omit<Student, 'id'>) => void | Promise<void>;
  onBatchAddStudents?: (names: string[], turma: TurmaType, activities: ActivityType[], diasFrequencia?: DayOfWeek[]) => void | Promise<void>;
  onUpdateStudent: (student: Student) => void | Promise<void>;
  onDeleteStudent: (id: string, studentName?: string, studentTurma?: string) => void | Promise<void>;
  onAddTurma?: (turmaName: string) => boolean;
  onDeleteTurma?: (turmaName: string, deleteStudents: boolean, targetTurmaToReassign?: string, anoLetivo?: number) => void;
  selectedAnoLetivo?: number;
  onSelectAnoLetivo?: (ano: number) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students: initialStudents = [],
  records = [],
  turmas,
  activitiesList = ACTIVITIES_LIST,
  currentWeek = { weekNumber: 32, year: 2026, startDate: '2026-08-03', endDate: '2026-08-07', label: 'Semana 32 (03/08 - 07/08)' },
  currentUser = null,
  onAddStudent,
  onBatchAddStudents,
  onUpdateStudent,
  onDeleteStudent,
  onAddTurma,
  onDeleteTurma,
  selectedAnoLetivo: propSelectedAnoLetivo,
  onSelectAnoLetivo,
}) => {
  const [students, setStudents] = useState<Student[]>(initialStudents || []);

  // Sincroniza se a prop externa students for atualizada
  useEffect(() => {
    if (initialStudents) {
      setStudents(initialStudents);
    }
  }, [initialStudents]);
  const activeActivities = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
  const userCanManageStudents = canManageStudents(currentUser);
  const userCanManageTurmas = canManageTurmas(currentUser);

  const isCoordenador = currentUser?.role === 'coordenador';
  const userAssignedTurmas = React.useMemo(() => currentUser?.allowedClassIds || currentUser?.assignedTurmas || [], [currentUser]);

  const allowedTurmas = React.useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    const sorted = sortTurmasPedagogical(rawList);
    if (isCoordenador || !currentUser) return sorted;
    const userTurmaSet = new Set(userAssignedTurmas);
    return sorted.filter((t) => userTurmaSet.has(t));
  }, [turmas, isCoordenador, currentUser, userAssignedTurmas]);

  const allSchoolTurmas = React.useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return sortTurmasPedagogical(rawList);
  }, [turmas]);

  const activityMap = React.useMemo(() => {
    const map = new Map<string, ActivityItem>();
    activeActivities.forEach((item) => {
      map.set(item.id, item);
      map.set(item.name, item);
    });
    return map;
  }, [activeActivities]);

  // Modalidades oficiais especialistas que exigem chamada individual (Rotina, Balé, Dança, Flauta, Futebol, Ginástica, Judô e Natação)
  const extracurricularRollCallActivities = React.useMemo<ActivityItem[]>(() => {
    return OFFICIAL_ROLL_CALL_MODALITIES.map((name) => {
      const existing = activeActivities.find((a) => a.id === name || a.name === name);
      if (existing) return existing;
      return {
        id: name,
        name: name,
        icon:
          name === 'Rotina'
            ? 'Clock'
            : name === 'Natação'
            ? 'Waves'
            : name === 'Futebol'
            ? 'Trophy'
            : name === 'Judô'
            ? 'Award'
            : name === 'Balé'
            ? 'Sparkles'
            : name === 'Dança'
            ? 'Music'
            : name === 'Flauta'
            ? 'Music2'
            : 'Activity',
        description: name === 'Rotina' ? 'Rotina diária e chamada geral da turma' : `Modalidade especialista de ${name}`,
        defaultEquipment: '',
        requiresRollCall: true,
      };
    });
  }, [activeActivities]);

  const turmasList = allowedTurmas;

  const [selectedTurma, setSelectedTurma] = useState<TurmaType | 'TODAS'>('TODAS');
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | 'TODAS'>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');

  // Referência e scroll suave para a barra horizontal de turmas
  const turmasScrollRef = React.useRef<HTMLDivElement>(null);
  const scrollTurmasBar = (direction: 'left' | 'right') => {
    if (turmasScrollRef.current) {
      const scrollAmount = direction === 'left' ? -240 : 240;
      turmasScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Single Add form state
  // Filtro de Exercício Exibido na Gestão de Matrículas (2026 | 2027)
  const [internalSelectedAnoLetivo, setInternalSelectedAnoLetivo] = useState<number>(propSelectedAnoLetivo ?? 2026);
  const selectedAnoLetivo = propSelectedAnoLetivo ?? internalSelectedAnoLetivo;
  const setSelectedAnoLetivo = React.useCallback(
    (ano: number) => {
      setInternalSelectedAnoLetivo(ano);
      if (onSelectAnoLetivo) {
        onSelectAnoLetivo(ano);
      }
    },
    [onSelectAnoLetivo]
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTurma, setNewTurma] = useState<TurmaType>(turmasList[0] || '1º Ano Azul');
  const [newAnoLetivo, setNewAnoLetivo] = useState<number>(2026);
  const [newTipoSaida, setNewTipoSaida] = useState<'PAIS' | 'TRANSPORTE_ESCOLAR'>('PAIS');
  const [newNomeCondutor, setNewNomeCondutor] = useState<string>('');
  const [newActivities, setNewActivities] = useState<ActivityType[]>(['Rotina']);
  const [newHasReforco, setNewHasReforco] = useState(false);
  const [newReforcoStartDate, setNewReforcoStartDate] = useState<string>('');
  const [newReforcoEndDate, setNewReforcoEndDate] = useState<string>('');
  const [newTipoContrato, setNewTipoContrato] = useState<ContractType>('regular');
  const [newDataInicio, setNewDataInicio] = useState<string>(toISODateString(new Date()));
  const [newDataTermino, setNewDataTermino] = useState<string>(toISODateString(new Date()));
  const [newDiasContratados, setNewDiasContratados] = useState<DayOfWeek[]>(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
  const [newDiasFrequencia, setNewDiasFrequencia] = useState<DayOfWeek[]>(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
  const [newHorariosSaida, setNewHorariosSaida] = useState<Partial<Record<DayOfWeek, string>>>({});
  const [isSavingSingle, setIsSavingSingle] = useState(false);

  // Plano Contratual & Financeiro do Novo Aluno (Mapeamento Dinâmico 2026 vs 2027)
  const [newPlanoContratual, setNewPlanoContratual] = useState<PlanoContratualType>('Integral Semana (18:30h)');
  const [newHorarioPermanenciaLimite, setNewHorarioPermanenciaLimite] = useState<string>('18:30h');
  const [newValorPlanoBase, setNewValorPlanoBase] = useState<number>(() => {
    return getTabelaPlanosPorAno(2026)['Integral Semana (18:30h)'].valorBase; // R$ 1.120,00
  });
  const [newDescontoBolsa, setNewDescontoBolsa] = useState<number>(0);

  const handleSelectNewPlano = (plano: PlanoContratualType) => {
    setNewPlanoContratual(plano);
    if (plano !== 'Personalizado') {
      const tabela = getTabelaPlanosPorAno(newAnoLetivo);
      const info = tabela[plano];
      if (info) {
        setNewValorPlanoBase(info.valorBase);
        setNewHorarioPermanenciaLimite(info.horarioPadrao);
      }
    }
  };

  const handleChangeNewAnoLetivo = (ano: number) => {
    setNewAnoLetivo(ano);
    if (newPlanoContratual !== 'Personalizado') {
      const tabela = getTabelaPlanosPorAno(ano);
      const info = tabela[newPlanoContratual];
      if (info) {
        setNewValorPlanoBase(info.valorBase);
        setNewHorarioPermanenciaLimite(info.horarioPadrao);
      }
    }
  };

  // Sincroniza o ano letivo do formulário com o exercício exibido ativo
  useEffect(() => {
    setNewAnoLetivo(selectedAnoLetivo);
    if (newPlanoContratual !== 'Personalizado') {
      const tabela = getTabelaPlanosPorAno(selectedAnoLetivo);
      const info = tabela[newPlanoContratual];
      if (info) {
        setNewValorPlanoBase(info.valorBase);
        setNewHorarioPermanenciaLimite(info.horarioPadrao);
      }
    }
  }, [selectedAnoLetivo]);

  const newValorMensalidadeFinal = Math.max(0, (newValorPlanoBase || 0) - (newDescontoBolsa || 0));

  // E1 Multi-Turma Parser State (processado via src/utils/e1Parser.ts com codificação ISO-8859-1 e separação de Matrícula x Turma)

  // Batch Add state
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchNamesText, setBatchNamesText] = useState('');
  const [batchTurma, setBatchTurma] = useState<TurmaType>(turmasList[0] || '1º Ano Azul');
  const [batchActivities, setBatchActivities] = useState<ActivityType[]>(['Rotina']);
  const [batchDiasFrequencia, setBatchDiasFrequencia] = useState<DayOfWeek[]>(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [e1ParsedStudents, setE1ParsedStudents] = useState<E1ExtractedStudent[]>([]);
  const [expandedTurmaDetails, setExpandedTurmaDetails] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const e1TurmaCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    e1ParsedStudents.forEach((st) => {
      const cleanTurma = st.turma?.trim();
      if (cleanTurma && !isHeaderOrSystemText(st.name) && isStudentNameCell(st.name)) {
        counts[cleanTurma] = (counts[cleanTurma] || 0) + 1;
      }
    });
    return counts;
  }, [e1ParsedStudents]);

  const handleProcessFile = async (file: File) => {
    try {
      setUploadedFileName(file.name);
      setBatchFormError(null);

      // 1. Leitura nativa com FileReader e codificação ISO-8859-1 (Windows-1252) para correta acentuação
      let textContent = '';
      try {
        textContent = await readE1FileAsText(file, 'ISO-8859-1');
      } catch (readErr) {
        console.warn('Falha no FileReader com ISO-8859-1, tentando fallback file.text():', readErr);
        try {
          textContent = await file.text();
        } catch (e) {}
      }

      const isHtml =
        textContent.includes('<') &&
        (textContent.includes('<table') ||
          textContent.includes('Turma:') ||
          textContent.includes('tabela_relatorio') ||
          textContent.includes('<html') ||
          textContent.includes('<tr') ||
          textContent.includes('<body'));

      if (isHtml) {
        const e1Students = parseE1HtmlReport(textContent);
        const validStudents = e1Students.filter(
          (s) => s.turma && s.turma.trim() && !isHeaderOrSystemText(s.name) && isStudentNameCell(s.name)
        );
        if (validStudents.length > 0) {
          setE1ParsedStudents(validStudents);
          setBatchNamesText(validStudents.map((s) => s.name).join('\n'));
          return;
        }
      }

      // 2. Fallback para arquivos binários .xls/.xlsx via SheetJS com mapeamento estrito
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });

      const sheetStudents = parseE1SheetRows(rows, batchTurma);
      const validStudents = sheetStudents.filter(
        (s) => s.turma && s.turma.trim() && !isHeaderOrSystemText(s.name) && isStudentNameCell(s.name)
      );
      if (validStudents.length > 0) {
        setE1ParsedStudents(validStudents);
        setBatchNamesText(validStudents.map((s) => s.name).join('\n'));
        return;
      }

      setBatchFormError('Nenhum aluno foi identificado no arquivo .xls selecionado. Verifique se o relatório contém alunos cadastrados.');
    } catch (err: any) {
      console.warn('Erro ao processar arquivo .xls:', err);
      setBatchFormError('Falha ao processar o arquivo .xls. Verifique se o arquivo foi exportado do relatório de turmas do Sistema E1.');
    }
  };

  const toggleDayInList = (currentDays: DayOfWeek[] | undefined, day: DayOfWeek): DayOfWeek[] => {
    const allWeekdays: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
    const current: DayOfWeek[] = currentDays && currentDays.length > 0 ? currentDays : allWeekdays;
    if (current.includes(day)) {
      const next = current.filter((d) => d !== day);
      return next.length > 0 ? next : [day]; // Keep at least 1 day
    } else {
      const next = [...current, day];
      return allWeekdays.filter((d) => next.includes(d));
    }
  };

  // Keep selectedTurma and form turmas aligned with allowed turmas for non-coordenador
  React.useEffect(() => {
    if (!isCoordenador && currentUser) {
      if (allowedTurmas.length === 1) {
        if (selectedTurma !== allowedTurmas[0]) {
          setSelectedTurma(allowedTurmas[0] as TurmaType);
        }
      } else if (
        allowedTurmas.length > 1 &&
        selectedTurma !== 'TODAS' &&
        !allowedTurmas.includes(selectedTurma)
      ) {
        setSelectedTurma(allowedTurmas[0] as TurmaType);
      } else if (allowedTurmas.length === 0 && selectedTurma !== 'TODAS') {
        setSelectedTurma('TODAS');
      }
    }
  }, [isCoordenador, currentUser?.id, allowedTurmas.length, allowedTurmas.join(','), selectedTurma]);

  // Keep form turmas aligned with allowed turmas
  React.useEffect(() => {
    if (allowedTurmas.length > 0) {
      if (!allowedTurmas.includes(newTurma)) {
        setNewTurma(allowedTurmas[0] as TurmaType);
      }
      if (!allowedTurmas.includes(batchTurma)) {
        setBatchTurma(allowedTurmas[0] as TurmaType);
      }
    }
  }, [allowedTurmas.length, allowedTurmas.join(','), newTurma, batchTurma]);

  // Edit, Transfer & Delete modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [originalStudentForEdit, setOriginalStudentForEdit] = useState<Student | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const editTurmasList = React.useMemo(() => {
    const baseList = isCoordenador || editingStudent?.anoLetivo === 2027 ? allSchoolTurmas : allowedTurmas;
    if (editingStudent?.turma && !baseList.includes(editingStudent.turma as any)) {
      return [...baseList, editingStudent.turma as TurmaType];
    }
    return baseList;
  }, [isCoordenador, allSchoolTurmas, allowedTurmas, editingStudent?.anoLetivo, editingStudent?.turma]);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete || isDeletingStudent) return;
    if (!isCoordenador && !userCanManageStudents && currentUser && !allowedTurmas.includes(studentToDelete.turma)) {
      setToastMsg({
        text: 'Você não tem permissão para excluir alunos desta turma.',
        type: 'error',
      });
      setStudentToDelete(null);
      return;
    }

    const studentName = studentToDelete.name;
    const studentId = studentToDelete.id;
    const studentTurma = studentToDelete.turma;
    setIsDeletingStudent(true);

    try {
      // Exclusão efetiva no Firestore de forma assíncrona
      await onDeleteStudent(studentId, studentName, studentTurma);
      setStudents((prev) =>
        prev.filter(
          (s) =>
            s.id !== studentId &&
            !(
              s.name.trim().toLowerCase() === studentName.trim().toLowerCase() &&
              s.turma.trim().toLowerCase() === studentTurma.trim().toLowerCase()
            )
        )
      );
      setToastMsg({
        text: `Aluno "${studentName}" excluído permanentemente com sucesso.`,
        type: 'success',
      });
      setStudentToDelete(null);
    } catch (err: any) {
      console.error('Falha ao excluir aluno no Firestore:', err);
      const isPermError =
        err?.code === 'permission-denied' ||
        err?.message?.toLowerCase()?.includes('permission') ||
        err?.message?.toLowerCase()?.includes('permissão');
      const errorMsg = isPermError
        ? 'Erro de permissão no Firestore. O aluno não foi excluído.'
        : `Erro de rede ou conexão ao excluir no Firestore: ${err?.message || 'Falha de comunicação'}. O aluno permanece no cadastro.`;

      setToastMsg({ text: errorMsg, type: 'error' });
      // Se a remoção no Firestore falhar, exibe toast de erro e NÃO remove o aluno da tela
      setStudentToDelete(null);
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [targetTransferTurma, setTargetTransferTurma] = useState<string>('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  // Estado do visualizador de PDF para relatório individual de frequência
  const [pdfPreviewState, setPdfPreviewState] = useState<{
    isOpen: boolean;
    doc?: any;
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

  const handleOpenFichaMatriculaPDF = (targetStudent: Student) => {
    const targetYear = targetStudent.anoLetivo || selectedAnoLetivo || 2026;
    const result = generateFichaMatriculaPDF({
      student: targetStudent,
      schoolYear: targetYear,
    });
    setPdfPreviewState({
      isOpen: true,
      doc: result.doc,
      dataUrl: result.dataUrl || result.dataUri,
      blobUrl: result.blobUrl,
      filename: result.filename,
      title: `Ficha Cadastral de Matrícula - ${targetStudent.name}`,
      onDownload: result.download,
    });
  };

  // Estado para Emissão do Termo de Liberação Excepcional / Saída Avulsa
  const [saidaAvulsaModalOpen, setSaidaAvulsaModalOpen] = useState(false);
  const [studentForSaidaAvulsa, setStudentForSaidaAvulsa] = useState<Student | null>(null);

  const handleOpenTermoSaidaAvulsa = (targetStudent: Student) => {
    setStudentForSaidaAvulsa(targetStudent);
    setSaidaAvulsaModalOpen(true);
  };

  // Estado do Módulo de Relações Nominais Cadastrais
  const [showNominalListModal, setShowNominalListModal] = useState(false);
  const [nominalFilterSpecialty, setNominalFilterSpecialty] = useState<string>('Rotina');
  const [nominalFilterTurma, setNominalFilterTurma] = useState<string>('TODAS');
  const [nominalFilterDay, setNominalFilterDay] = useState<string>('todos');


  // Inativação Automática Pós-Período de Contratos Avulsos/Temporários
  React.useEffect(() => {
    const today = toISODateString(new Date());
    const expiredStudents = (students || []).filter(
      (s) =>
        s.tipoContrato === 'avulso' &&
        (s.status || 'ativo') === 'ativo' &&
        s.dataTerminoContrato &&
        s.dataTerminoContrato.trim().length > 0 &&
        s.dataTerminoContrato.trim() < today
    );

    if (expiredStudents.length > 0 && userCanManageStudents) {
      expiredStudents.forEach((student) => {
        onUpdateStudent({
          ...student,
          status: 'inativo',
          statusMatricula: 'inativo',
          inactivationDate: student.dataTerminoContrato?.trim() || today,
          inactivationReason: 'Contrato Concluído',
        });
      });
    }
  }, [students, userCanManageStudents, onUpdateStudent]);

  const handleOpenEdit = (student: Student) => {
    if (!isCoordenador && currentUser && !allowedTurmas.includes(student.turma)) {
      return;
    }
    setEditFormError(null);
    const today = toISODateString(new Date());
    const prepared: Student = {
      ...student,
      tipoContrato: student.tipoContrato || 'regular',
      dataInicioContrato: student.dataInicioContrato || today,
      dataTerminoContrato: student.dataTerminoContrato || today,
      diasContratados:
        student.diasContratados && student.diasContratados.length > 0
          ? student.diasContratados
          : student.diasFrequencia && student.diasFrequencia.length > 0
          ? student.diasFrequencia
          : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      diasFrequencia:
        student.diasFrequencia && student.diasFrequencia.length > 0
          ? student.diasFrequencia
          : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      horariosSaida: student.horariosSaida ? { ...student.horariosSaida } : {},
      anoLetivo: student.anoLetivo || selectedAnoLetivo || 2026,
      tipoSaida: student.tipoSaida || 'PAIS',
      nomeCondutor: student.nomeCondutor || '',
      planoContratual: student.planoContratual || 'Integral Semana (18:30h)',
      horarioPermanenciaLimite:
        student.horarioPermanenciaLimite ||
        (student.planoContratual
          ? getTabelaPlanosPorAno(student.anoLetivo || selectedAnoLetivo || 2026)[student.planoContratual]?.horarioPadrao
          : '18:30h') ||
        '18:30h',
      valorPlanoBase:
        student.valorPlanoBase != null
          ? student.valorPlanoBase
          : (student.planoContratual
              ? getTabelaPlanosPorAno(student.anoLetivo || selectedAnoLetivo || 2026)[student.planoContratual]?.valorBase
              : getTabelaPlanosPorAno(student.anoLetivo || selectedAnoLetivo || 2026)['Integral Semana (18:30h)'].valorBase) ??
            (student.anoLetivo === 2027 ? 1250 : 1120),
      descontoBolsa: student.descontoBolsa || 0,
      valorMensalidadeFinal:
        student.valorMensalidadeFinal != null
          ? student.valorMensalidadeFinal
          : Math.max(
              0,
              (student.valorPlanoBase != null
                ? student.valorPlanoBase
                : (student.planoContratual
                    ? getTabelaPlanosPorAno(student.anoLetivo || selectedAnoLetivo || 2026)[student.planoContratual]?.valorBase
                    : getTabelaPlanosPorAno(student.anoLetivo || selectedAnoLetivo || 2026)['Integral Semana (18:30h)'].valorBase) ??
                  (student.anoLetivo === 2027 ? 1250 : 1120)) -
                (student.descontoBolsa || 0)
            ),
    };
    setOriginalStudentForEdit(prepared);
    setEditingStudent(prepared);
  };

  const handleSelectEditPlano = (plano: PlanoContratualType) => {
    if (!editingStudent) return;
    const studentYear = editingStudent.anoLetivo || selectedAnoLetivo || 2026;
    const tabela = getTabelaPlanosPorAno(studentYear);

    if (plano !== 'Personalizado') {
      const info = tabela[plano];
      const base = info?.valorBase ?? (studentYear === 2027 ? 1250 : 1120);
      const horario = info?.horarioPadrao ?? '18:30h';
      const desconto = editingStudent.descontoBolsa || 0;
      setEditingStudent((prev) =>
        prev
          ? {
              ...prev,
              planoContratual: plano,
              valorPlanoBase: base,
              horarioPermanenciaLimite: horario,
              valorMensalidadeFinal: Math.max(0, base - desconto),
            }
          : null
      );
    } else {
      setEditingStudent((prev) =>
        prev
          ? {
              ...prev,
              planoContratual: plano,
            }
          : null
      );
    }
  };

  const handleChangeEditBase = (baseVal: number) => {
    if (!editingStudent) return;
    const desconto = editingStudent.descontoBolsa || 0;
    setEditingStudent((prev) =>
      prev
        ? {
            ...prev,
            valorPlanoBase: baseVal,
            valorMensalidadeFinal: Math.max(0, baseVal - desconto),
          }
        : null
    );
  };

  const handleChangeEditDesconto = (descVal: number) => {
    if (!editingStudent) return;
    const base = editingStudent.valorPlanoBase || 0;
    setEditingStudent((prev) =>
      prev
        ? {
            ...prev,
            descontoBolsa: descVal,
            valorMensalidadeFinal: Math.max(0, base - descVal),
          }
        : null
    );
  };

  const handleToggleEditAnoLetivo = (targetYear: number) => {
    if (!editingStudent) return;
    const targetTabela = getTabelaPlanosPorAno(targetYear);
    const targetPlano = editingStudent.planoContratual || 'Integral Semana (18:30h)';
    const isPersonalizado = targetPlano === 'Personalizado';
    const targetBase = isPersonalizado
      ? (editingStudent.valorPlanoBase || 0)
      : targetTabela[targetPlano]?.valorBase ?? (targetYear === 2027 ? 1250 : 1120);
    const targetHorario = isPersonalizado
      ? (editingStudent.horarioPermanenciaLimite || '18:30h')
      : targetTabela[targetPlano]?.horarioPadrao ?? '18:30h';
    const desconto = editingStudent.descontoBolsa || 0;

    if (targetYear === 2027) {
      // a) Promoção Automática de Turma:
      // Identifica a turma atual (ex: 1º Ano Azul) e seleciona a turma do ano seguinte preservando cor/linha
      const baseTurma = originalStudentForEdit?.turma || editingStudent.turma;
      const allSchoolTurmasList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
      const nextTurma = (getNextAcademicTurma(baseTurma, allSchoolTurmasList) || baseTurma) as TurmaType;

      setEditingStudent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          anoLetivo: 2027,
          turma: nextTurma,
          // b) Reset de Modalidades Extracurriculares: apenas ['Rotina']
          activities: ['Rotina'],
          modalidadesEspeciais: [],
          specialties: [],
          reforcoStartDate: undefined,
          reforcoEndDate: undefined,
          // c) Limpeza dos Horários de Saída: zera horários individuais
          horariosSaida: {},
          // d) Reset de Status e Contrato: Ativo e Regular
          status: 'ativo',
          statusMatricula: 'ativo',
          inactivationDate: undefined,
          inactivationReason: undefined,
          tipoContrato: 'regular',
          dataInicioContrato: undefined,
          dataTerminoContrato: undefined,
          diasContratados: undefined,
          // e) Mapeamento Dinâmico do Plano Contratual para 2027
          valorPlanoBase: targetBase,
          horarioPermanenciaLimite: targetHorario,
          valorMensalidadeFinal: Math.max(0, targetBase - desconto),
        };
      });
    } else {
      // Se o usuário alternar de volta para "2026", restaura os dados originais aplicando tabela 2026
      if (originalStudentForEdit) {
        setEditingStudent((prev) => ({
          ...originalStudentForEdit,
          name: prev?.name || originalStudentForEdit.name,
          anoLetivo: 2026,
          valorPlanoBase: targetBase,
          horarioPermanenciaLimite: targetHorario,
          valorMensalidadeFinal: Math.max(0, targetBase - desconto),
        }));
      } else {
        setEditingStudent((prev) =>
          prev
            ? {
                ...prev,
                anoLetivo: 2026,
                valorPlanoBase: targetBase,
                horarioPermanenciaLimite: targetHorario,
                valorMensalidadeFinal: Math.max(0, targetBase - desconto),
              }
            : null
        );
      }
    }
  };

  const handleOpenDelete = (student: Student) => {
    if (!isCoordenador && currentUser && !allowedTurmas.includes(student.turma)) {
      return;
    }
    setStudentToDelete(student);
  };

  const handleOpenTransfer = (student: Student) => {
    if (!isCoordenador && currentUser && !allowedTurmas.includes(student.turma)) {
      return;
    }
    setTransferringStudent(student);
    const otherTurmas = allowedTurmas.filter((t) => t !== student.turma);
    setTargetTransferTurma(otherTurmas[0] || student.turma);
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringStudent || !targetTransferTurma) return;
    if (!isCoordenador && currentUser && !allowedTurmas.includes(targetTransferTurma)) {
      return;
    }
    if (targetTransferTurma === transferringStudent.turma) {
      setTransferringStudent(null);
      return;
    }
    setIsSavingTransfer(true);
    try {
      // Update active turma for student while preserving all historical attendance records
      await Promise.resolve(
        onUpdateStudent({
          ...transferringStudent,
          turma: targetTransferTurma,
        })
      );
      setTransferringStudent(null);
    } catch (err) {
      console.error('Error transferring student:', err);
    } finally {
      setIsSavingTransfer(false);
    }
  };

  // Turma deletion and management states
  const [turmaToDelete, setTurmaToDelete] = useState<string | null>(null);
  const [deleteStudentsWithTurma, setDeleteStudentsWithTurma] = useState<boolean>(true);
  const [reassignTargetTurma, setReassignTargetTurma] = useState<string>('');
  const [showManageTurmasModal, setShowManageTurmasModal] = useState<boolean>(false);
  const [newCustomTurmaInput, setNewCustomTurmaInput] = useState<string>('');
  const [customTurmaError, setCustomTurmaError] = useState<string | null>(null);

  // Form error messages (replacing browser alert windows)
  const [singleFormError, setSingleFormError] = useState<string | null>(null);
  const [batchFormError, setBatchFormError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Status Filter for Students ('ativos' | 'inativos' | 'todos')
  const [statusFilter, setStatusFilter] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  // Filtro Rápido de Origem no Exercício 2027 ('todos' | 'rematriculados' | 'novos' | 'novos_mini' | 'novos_outros')
  const [originFilter, setOriginFilter] = useState<'todos' | 'rematriculados' | 'novos' | 'novos_mini' | 'novos_outros'>('todos');

  // Helper para verificar se a turma é 6º Ano (conclusão/saída de ciclo escolar)
  const isTurma6Ano = React.useCallback((turma: string = '') => {
    const t = (turma || '').toLowerCase();
    return t.includes('6º') || t.includes('6o') || t.includes('6 ano') || (t.includes('6') && t.includes('ano'));
  }, []);

  // Helper para verificar se a turma é Mini Maternal (turma de entrada 100% nova)
  const isTurmaMiniMaternal = React.useCallback((turma: string = '') => {
    const t = (turma || '').toLowerCase();
    return t.includes('mini') && t.includes('maternal');
  }, []);

  // Listas de alunos de 2026 e 2027 com igualdade estrita
  const students2026List = React.useMemo(
    () => (students || []).filter((s) => (s.anoLetivo || 2026) === 2026),
    [students]
  );
  const students2027List = React.useMemo(
    () => (students || []).filter((s) => s.anoLetivo === 2027),
    [students]
  );

  // Mapeamento de histórico cadastral de 2026 (Lookup por RA e Nome Normalizado)
  const history2026Lookup = React.useMemo(() => {
    const matriculas = new Set<string>();
    const names = new Set<string>();

    students2026List.forEach((s) => {
      const cleanMat = s.matricula ? cleanMatriculaValue(s.matricula) : '';
      if (cleanMat && isNumericMatricula(cleanMat)) {
        matriculas.add(cleanMat);
      }
      const normName = normalizeStudentNameForMatching(s.name);
      if (normName) {
        names.add(normName);
      }
    });

    return { matriculas, names };
  }, [students2026List]);

  // Função para verificar se um aluno de 2027 é rematriculado com histórico confirmado em 2026
  const isStudentRematriculadoFrom2026 = React.useCallback(
    (student: Student) => {
      const cleanMat = student.matricula ? cleanMatriculaValue(student.matricula) : '';
      if (cleanMat && isNumericMatricula(cleanMat) && history2026Lookup.matriculas.has(cleanMat)) {
        return true;
      }
      const normName = normalizeStudentNameForMatching(student.name);
      if (normName && history2026Lookup.names.has(normName)) {
        return true;
      }
      return false;
    },
    [history2026Lookup]
  );

  // Painel de Métricas Estatísticas de Renovação/Captação (2026 -> 2027)
  const metrics2027 = React.useMemo(() => {
    // 1. Base 2026 Ativa: Filtrar ESTRITAMENTE alunos com status de matrícula ATIVO em 2026
    const total2026 = students2026List.length;
    const activeStudents2026 = students2026List.filter(isStudentActive);
    const totalAtivos2026Count = activeStudents2026.length;

    // Subtrair da base ativa exclusivamente os alunos do 6º Ano de 2026 que também estejam com status Ativo
    const formandos6AnoAtivos2026 = activeStudents2026.filter((s) => isTurma6Ano(s.turma));
    const baseElegivel2026 = activeStudents2026.filter((s) => !isTurma6Ano(s.turma));
    const baseElegivel2026Count = baseElegivel2026.length;

    // 2. Classificação de 2027: Rematriculados vs Novos
    const total2027 = students2027List.length;
    const rematriculados = students2027List.filter((s) => isStudentRematriculadoFrom2026(s));
    const novos = students2027List.filter((s) => !isStudentRematriculadoFrom2026(s));

    // Detalhamento de Novos: Mini Maternal (turma de entrada 100% nova) vs Maternal ao 6º Ano
    const novosMiniMaternal = novos.filter((s) => isTurmaMiniMaternal(s.turma));
    const novosMaternalAo6Ano = novos.filter((s) => !isTurmaMiniMaternal(s.turma));

    // 3. Taxa de Retenção/Rematrícula: % sobre a base ESTRITAMENTE ATIVA elegível de 2026 (excluindo 6º ano ativo)
    const taxaRetencaoPct =
      baseElegivel2026Count > 0 ? (rematriculados.length / baseElegivel2026Count) * 100 : 0;

    // 4. Composição Percentual de 2027: % Rematriculados | % Novos Alunos
    const composicaoRematriculadosPct =
      total2027 > 0 ? (rematriculados.length / total2027) * 100 : 0;
    const composicaoNovosPct =
      total2027 > 0 ? (novos.length / total2027) * 100 : 0;

    const composicaoNovosMiniPct =
      total2027 > 0 ? (novosMiniMaternal.length / total2027) * 100 : 0;
    const composicaoNovosMaternalAo6Pct =
      total2027 > 0 ? (novosMaternalAo6Ano.length / total2027) * 100 : 0;

    return {
      total2026,
      totalAtivos2026Count,
      formandos6AnoCount: formandos6AnoAtivos2026.length,
      baseElegivel2026Count,
      total2027,
      rematriculadosCount: rematriculados.length,
      novosCount: novos.length,
      novosMiniMaternalCount: novosMiniMaternal.length,
      novosMaternalAo6AnoCount: novosMaternalAo6Ano.length,
      taxaRetencaoPct,
      composicaoRematriculadosPct,
      composicaoNovosPct,
      composicaoNovosMiniPct,
      composicaoNovosMaternalAo6Pct,
    };
  }, [students2026List, students2027List, isTurma6Ano, isTurmaMiniMaternal, isStudentRematriculadoFrom2026]);

  // Contagens por Ano Letivo (Exercício 2026 vs 2027) com igualdade estrita
  const count2026 = React.useMemo(
    () => students2026List.length,
    [students2026List]
  );
  const count2027 = React.useMemo(
    () => students2027List.length,
    [students2027List]
  );

  // Alunos pertencentes ao exercício selecionado (2026 ou 2027) com igualdade estrita
  const studentsForSelectedYear = React.useMemo(() => {
    return (students || []).filter((s) => (s.anoLetivo || 2026) === selectedAnoLetivo);
  }, [students, selectedAnoLetivo]);

  const totalAtivosCount = React.useMemo(
    () => studentsForSelectedYear.filter((s) => (s.status || 'ativo') === 'ativo').length,
    [studentsForSelectedYear]
  );
  const totalInativosCount = React.useMemo(
    () => studentsForSelectedYear.filter((s) => s.status === 'inativo' || s.status === 'cancelado').length,
    [studentsForSelectedYear]
  );

  // Detecção e Sanitização de Cadastros Duplicados por Ano Letivo
  const duplicateInfoCurrentYear = React.useMemo(() => {
    return findDuplicateStudentGroups(students || [], selectedAnoLetivo);
  }, [students, selectedAnoLetivo]);

  const duplicateInfo2027 = React.useMemo(() => {
    return findDuplicateStudentGroups(students || [], 2027);
  }, [students]);

  const auditReport2027 = React.useMemo(() => {
    return audit2027Students(students || []);
  }, [students]);

  const [showSanitizeModal, setShowSanitizeModal] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [sanitizeTargetYear, setSanitizeTargetYear] = useState<number>(2027);

  const handleOpenSanitizeModal = (yearToSanitize?: number) => {
    const yr = yearToSanitize !== undefined ? yearToSanitize : selectedAnoLetivo;
    setSanitizeTargetYear(yr);
    setShowSanitizeModal(true);
  };

  const handleExecuteSanitize = async () => {
    setIsSanitizing(true);
    try {
      if (sanitizeTargetYear === 2027) {
        await purgeSurplus2027Students();
      }

      const info = findDuplicateStudentGroups(students || [], sanitizeTargetYear);
      if (info.allIdsToDelete.length === 0) {
        setToastMsg({
          text: `Base do Ano Letivo ${sanitizeTargetYear} auditada com sucesso: ${sanitizeTargetYear === 2027 ? `${OFFICIAL_2027_BATCH_COUNT} alunos oficiais` : 'sem duplicatas'}.`,
          type: 'success',
        });
        setShowSanitizeModal(false);
        return;
      }
      // 1. Salva dados dos alunos canônicos vencedores no Firestore caso haja mesclagem
      const canonicalBatch = writeBatch(db);
      info.groups.forEach((group) => {
        const can = group.canonical;
        const payload = {
          id: can.id,
          matricula: can.matricula || can.id,
          name: can.name,
          turma: can.turma,
          anoLetivo: can.anoLetivo,
          activities: can.activities || ['Rotina'],
          tipoSaida: can.tipoSaida || 'PAIS',
          status: can.status || 'ativo',
          statusMatricula: can.statusMatricula || 'ativo',
          tipoContrato: can.tipoContrato || 'regular',
          diasFrequencia: can.diasFrequencia,
          horariosSaida: can.horariosSaida || {},
          planoContratual: can.planoContratual || 'Integral Semana (18:30h)',
          horarioPermanenciaLimite: can.horarioPermanenciaLimite || '18:30',
          valorPlanoBase: can.valorPlanoBase || 0,
          descontoBolsa: can.descontoBolsa || 0,
          valorMensalidadeFinal: can.valorMensalidadeFinal || 0,
          updatedAt: new Date().toISOString(),
        };
        canonicalBatch.set(doc(db, 'alunos', can.id), payload, { merge: true });
        canonicalBatch.set(doc(db, 'students', can.id), payload, { merge: true });
      });
      await canonicalBatch.commit();

      // 2. Exclui em lote todos os IDs duplicados no Firestore e sincroniza marcas de exclusão (protegendo os 8 oficiais ativos do Mini Maternal 2026)
      const safeIdsToDelete = info.allIdsToDelete.filter(
        (id) =>
          id === 'st-2026-minimaternal-jose-ricardo-bijora-maneghin' ||
          (!PROTECTED_MINI_MATERNAL_2026_IDS.has(id) && !id.startsWith('st-2026-minimaternal'))
      );
      const totalDeleted = await batchDeleteStudentsFromFirestore(safeIdsToDelete);

      // 3. Atualiza cache local e estado
      const currentList = loadStudents();
      const idsToDeleteSet = new Set(safeIdsToDelete);
      const cleaned = currentList.filter((s) => !idsToDeleteSet.has(s.id));
      saveStudents(cleaned);
      setStudents(cleaned);
      broadcastSyncEvent('SYNC_STUDENTS', cleaned);

      setShowSanitizeModal(false);
      setToastMsg({
        text: `🧹 Sanitização concluída com sucesso! ${totalDeleted} cadastros duplicados foram removidos do Ano Letivo ${sanitizeTargetYear}.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Erro na rotina de sanitização:', err);
      setToastMsg({
        text: err?.message || 'Erro ao remover cadastros duplicados no Firestore.',
        type: 'error',
      });
    } finally {
      setIsSanitizing(false);
    }
  };

  const filteredStudents = React.useMemo(() => {
    return studentsForSelectedYear
      .filter((student) => {
        if (!student) return false;
        if (!isCoordenador && currentUser && !allowedTurmas.includes(student.turma)) {
          return false;
        }

        const studentStatus = student.status || 'ativo';
        if (statusFilter === 'ativos' && studentStatus !== 'ativo') {
          return false;
        }
        if (statusFilter === 'inativos' && studentStatus === 'ativo') {
          return false;
        }

        // Filtro Rápido de Origem (Rematriculado vs. Novo) aplicável no Exercício 2027
        if (selectedAnoLetivo === 2027 && originFilter !== 'todos') {
          const isRematriculado = isStudentRematriculadoFrom2026(student);
          if (originFilter === 'rematriculados' && !isRematriculado) {
            return false;
          }
          if (originFilter === 'novos' && isRematriculado) {
            return false;
          }
          if (originFilter === 'novos_mini') {
            if (isRematriculado || !isTurmaMiniMaternal(student.turma)) {
              return false;
            }
          }
          if (originFilter === 'novos_outros') {
            if (isRematriculado || isTurmaMiniMaternal(student.turma)) {
              return false;
            }
          }
        }

        const studentActs = Array.isArray(student.activities) ? student.activities : [];
        const matchesTurma = selectedTurma === 'TODAS' || student.turma === selectedTurma;
        const isReforco = selectedActivity === 'Reforço';
        const matchesActivity =
          selectedActivity === 'TODAS' || (selectedActivity as string) === 'TODOS'
            ? true
            : isReforco
            ? ((student.modalidadesEspeciais || []).includes('Reforço') || studentActs.includes('Reforço'))
            : studentActs.includes(selectedActivity);
        const matchesSearch =
          searchTerm.trim() === '' ||
          (student.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesTurma && matchesActivity && matchesSearch;
      })
      .sort((a, b) => {
        const turmaCompare = (a.turma || '').localeCompare(b.turma || '', 'pt-BR', { numeric: true });
        if (turmaCompare !== 0) return turmaCompare;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [
    studentsForSelectedYear,
    selectedTurma,
    selectedActivity,
    searchTerm,
    statusFilter,
    selectedAnoLetivo,
    originFilter,
    isStudentRematriculadoFrom2026,
    isTurmaMiniMaternal,
    isCoordenador,
    currentUser,
    allowedTurmas,
  ]);

  const handleQuickReactivate = async (student: Student) => {
    try {
      const today = toISODateString(new Date());
      // Se for contrato avulso e estiver com data de término vencida no passado (< today),
      // converte automaticamente para contrato 'regular' ao reativar, evitando que o useEffect
      // de expiração automática reverta a inativação no mesmo instante.
      const isExpiredAvulso =
        student.tipoContrato === 'avulso' &&
        Boolean(student.dataTerminoContrato && student.dataTerminoContrato.trim().length > 0 && student.dataTerminoContrato.trim() < today);

      const updated: Student = {
        ...student,
        status: 'ativo',
        statusMatricula: 'ativo',
        inactivationDate: '',
        inactivationReason: '',
        tipoContrato: isExpiredAvulso ? 'regular' : (student.tipoContrato || 'regular'),
        dataInicioContrato: isExpiredAvulso ? undefined : student.dataInicioContrato,
        dataTerminoContrato: isExpiredAvulso ? undefined : student.dataTerminoContrato,
        diasContratados: isExpiredAvulso ? undefined : student.diasContratados,
        diasFrequencia: isExpiredAvulso
          ? ['segunda', 'terca', 'quarta', 'quinta', 'sexta']
          : (student.diasFrequencia && student.diasFrequencia.length > 0 ? student.diasFrequencia : ['segunda', 'terca', 'quarta', 'quinta', 'sexta']),
        notes: isExpiredAvulso
          ? (student.notes ? `${student.notes} (Reativado como Regular em ${formatDateBR(today)})` : `Reativado como Regular em ${formatDateBR(today)}`)
          : student.notes,
      };
      (updated as any).updatedAt = new Date().toISOString();

      await Promise.resolve(onUpdateStudent(updated));
      setToastMsg({
        text: `Aluno "${student.name}" reativado com sucesso! Já está visível na chamada diária.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error reactivating student:', err);
      setToastMsg({
        text: `Erro ao reativar o aluno "${student.name}". Tente novamente.`,
        type: 'error',
      });
    }
  };

  const handleSingleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSingleFormError(null);
    const trimmedName = (newName || '').trim();
    if (!trimmedName) {
      setSingleFormError('Por favor, digite o nome do aluno.');
      return;
    }
    if (!isCoordenador && currentUser && !allowedTurmas.includes(newTurma)) {
      setSingleFormError('Você só tem permissão para cadastrar alunos nas suas turmas vinculadas.');
      return;
    }

    if (newTipoContrato === 'avulso') {
      if (!newDataInicio || !newDataInicio.trim()) {
        setSingleFormError('Para contrato Avulso / Temporário, informe a Data de Início obrigatória.');
        return;
      }
      if (!newDataTermino || !newDataTermino.trim()) {
        setSingleFormError('Para contrato Avulso / Temporário, informe a Data de Término obrigatória.');
        return;
      }
      if (newDataInicio > newDataTermino) {
        setSingleFormError('A Data de Início não pode ser posterior à Data de Término.');
        return;
      }
      if (!newDiasContratados || newDiasContratados.length === 0) {
        setSingleFormError('Selecione pelo menos um Dia da Semana Contratado (Segunda a Sexta).');
        return;
      }
    }

    if (newHasReforco) {
      if (newReforcoStartDate && newReforcoEndDate && newReforcoStartDate > newReforcoEndDate) {
        setSingleFormError('A Data de Início do Reforço não pode ser posterior à Data Final.');
        return;
      }
    }

    if (newTipoSaida === 'TRANSPORTE_ESCOLAR' && !newNomeCondutor.trim()) {
      setSingleFormError('Para Transporte Escolar, informe o Nome do Condutor / Tio(a) do Transporte.');
      return;
    }

    setIsSavingSingle(true);
    try {
      const finalActivities = newActivities.includes('Rotina')
        ? Array.from(new Set(newActivities))
        : ['Rotina', ...Array.from(new Set(newActivities))];

      const defaultWeekDays: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      const effectiveDias: DayOfWeek[] =
        newTipoContrato === 'avulso'
          ? (newDiasContratados && newDiasContratados.length > 0 ? newDiasContratados : defaultWeekDays)
          : (newDiasFrequencia && newDiasFrequencia.length > 0 ? newDiasFrequencia : defaultWeekDays);

      await Promise.resolve(
        onAddStudent({
          name: trimmedName,
          turma: newTurma,
          activities: finalActivities,
          modalidadesEspeciais: newHasReforco ? ['Reforço'] : [],
          specialties: newHasReforco ? ['Reforço'] : [],
          reforcoStartDate: newHasReforco && newReforcoStartDate ? newReforcoStartDate : undefined,
          reforcoEndDate: newHasReforco && newReforcoEndDate ? newReforcoEndDate : undefined,
          tipoContrato: newTipoContrato,
          dataInicioContrato: newTipoContrato === 'avulso' ? newDataInicio : undefined,
          dataTerminoContrato: newTipoContrato === 'avulso' ? newDataTermino : undefined,
          diasContratados: newTipoContrato === 'avulso' ? newDiasContratados : undefined,
          diasFrequencia: effectiveDias,
          horariosSaida: newHorariosSaida,
          status: 'ativo',
          anoLetivo: newAnoLetivo,
          tipoSaida: newTipoSaida,
          nomeCondutor: newTipoSaida === 'TRANSPORTE_ESCOLAR' ? newNomeCondutor.trim() : undefined,
          planoContratual: newPlanoContratual,
          horarioPermanenciaLimite: newHorarioPermanenciaLimite,
          valorPlanoBase: newValorPlanoBase,
          descontoBolsa: newDescontoBolsa,
          valorMensalidadeFinal: newValorMensalidadeFinal,
        })
      );
      setNewName('');
      setNewActivities(['Rotina']);
      setNewHasReforco(false);
      setNewReforcoStartDate('');
      setNewReforcoEndDate('');
      setNewTipoContrato('regular');
      setNewDataInicio(toISODateString(new Date()));
      setNewDataTermino(toISODateString(new Date()));
      setNewDiasContratados(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
      setNewDiasFrequencia(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
      setNewHorariosSaida({});
      const resetTabela = getTabelaPlanosPorAno(selectedAnoLetivo);
      setNewAnoLetivo(selectedAnoLetivo);
      setNewTipoSaida('PAIS');
      setNewNomeCondutor('');
      setNewPlanoContratual('Integral Semana (18:30h)');
      setNewHorarioPermanenciaLimite(resetTabela['Integral Semana (18:30h)'].horarioPadrao);
      setNewValorPlanoBase(resetTabela['Integral Semana (18:30h)'].valorBase);
      setNewDescontoBolsa(0);
      setShowAddForm(false);
      setSingleFormError(null);
    } catch (err: any) {
      console.error('Error saving new student:', err);
      setSingleFormError(err?.message || 'Erro ao cadastrar aluno. Tente novamente.');
    } finally {
      setIsSavingSingle(false);
    }
  };

  const handleBatchAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchFormError(null);

    // Caso 1: Importação Multi-Turmas do Sistema E1
    if (e1ParsedStudents.length > 0) {
      setIsSavingBatch(true);
      try {
        const targetYear = selectedAnoLetivo;
        const targetTabela = getTabelaPlanosPorAno(targetYear);
        const defaultPlanoKey: PlanoContratualType = 'Integral Semana (18:30h)';
        const defaultPlanoInfo = targetTabela[defaultPlanoKey];

        const currentLocal = loadStudents();

        const validStudentsToSave = e1ParsedStudents.filter(
          (st) => st.turma && st.turma.trim() && !isHeaderOrSystemText(st.name) && isStudentNameCell(st.name)
        );

        // Mapa de desduplicação interna do próprio lote sendo importado
        const batchUpsertMap = new Map<string, Student>();

        validStudentsToSave.forEach((st) => {
          const cleanName = sanitizeE1String(st.name);
          const normName = normalizeStudentNameForMatching(cleanName);
          const cleanMat = cleanMatriculaValue(st.matricula);
          const cleanTurma = mapE1TurmaNameToOfficial(st.turma) as TurmaType;

          // Busca por aluno pré-existente no mesmo ano letivo (por RA numérico ou nome normalizado)
          const existingMatch = currentLocal.find((ex) => {
            if (ex.anoLetivo !== targetYear) return false;
            const exCleanMat = ex.matricula ? cleanMatriculaValue(ex.matricula) : '';
            if (cleanMat && isNumericMatricula(cleanMat) && exCleanMat && isNumericMatricula(exCleanMat)) {
              return cleanMat === exCleanMat;
            }
            const exNormName = normalizeStudentNameForMatching(ex.name);
            return Boolean(exNormName && normName && exNormName === normName);
          });

          // Trava de Unicidade Rígida: se já existir, preserva o ID original sem corromper históricos;
          // se for novo, gera ID determinístico padronizado (aluno_${targetYear}_${ra || nome})
          const studentId = existingMatch?.id || generateDeterministicStudentId(targetYear, cleanMat, cleanName);

          // Preserva valores customizados pré-existentes (bolsa, planos, horários, atividades)
          const baseVal = existingMatch?.valorPlanoBase ?? defaultPlanoInfo.valorBase;
          const descVal = existingMatch?.descontoBolsa ?? 0;
          const finalVal = existingMatch?.valorMensalidadeFinal ?? Math.max(0, baseVal - descVal);

          const studentObj: Student = {
            id: studentId,
            matricula: cleanMat || existingMatch?.matricula || '',
            name: cleanName,
            turma: cleanTurma,
            anoLetivo: targetYear,
            activities: existingMatch?.activities && existingMatch.activities.length > 0 ? existingMatch.activities : ['Rotina'],
            tipoSaida: existingMatch?.tipoSaida || 'PAIS',
            status: existingMatch?.status || 'ativo',
            statusMatricula: existingMatch?.statusMatricula || 'ativo',
            tipoContrato: existingMatch?.tipoContrato || 'regular',
            diasFrequencia: existingMatch?.diasFrequencia && existingMatch.diasFrequencia.length > 0
              ? existingMatch.diasFrequencia
              : (batchDiasFrequencia && batchDiasFrequencia.length > 0
                ? batchDiasFrequencia
                : ['segunda', 'terca', 'quarta', 'quinta', 'sexta']),
            horariosSaida: existingMatch?.horariosSaida || {},
            planoContratual: existingMatch?.planoContratual || defaultPlanoKey,
            horarioPermanenciaLimite: existingMatch?.horarioPermanenciaLimite || defaultPlanoInfo.horarioPadrao,
            valorPlanoBase: baseVal,
            descontoBolsa: descVal,
            valorMensalidadeFinal: finalVal,
          };

          batchUpsertMap.set(studentId, studentObj);
        });

        const newStudentsList = Array.from(batchUpsertMap.values());

        // Gravação atômica em lotes (writeBatch) no Firestore (coleções 'alunos' e 'students')
        const BATCH_CHUNK_SIZE = 150;
        for (let i = 0; i < newStudentsList.length; i += BATCH_CHUNK_SIZE) {
          const chunk = newStudentsList.slice(i, i + BATCH_CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((student) => {
            const baseVal = student.valorPlanoBase ?? defaultPlanoInfo.valorBase;
            const descVal = student.descontoBolsa ?? 0;
            const payload = {
              id: student.id,
              matricula: student.matricula || student.id,
              name: student.name,
              turma: student.turma,
              anoLetivo: student.anoLetivo,
              activities: student.activities || ['Rotina'],
              tipoSaida: student.tipoSaida || 'PAIS',
              status: student.status || 'ativo',
              statusMatricula: student.statusMatricula || 'ativo',
              tipoContrato: student.tipoContrato || 'regular',
              diasFrequencia: student.diasFrequencia,
              horariosSaida: student.horariosSaida || {},
              planoContratual: student.planoContratual || defaultPlanoKey,
              horarioPermanenciaLimite: student.horarioPermanenciaLimite || defaultPlanoInfo.horarioPadrao,
              valorPlanoBase: baseVal,
              descontoBolsa: descVal,
              valorMensalidadeFinal: student.valorMensalidadeFinal ?? Math.max(0, baseVal - descVal),
              updatedAt: new Date().toISOString(),
            };
            batch.set(doc(db, 'alunos', student.id), payload, { merge: true });
            batch.set(doc(db, 'students', student.id), payload, { merge: true });
          });
          await batch.commit();
        }

        // Upsert no cache local e sincronização do estado (garante 0 duplicações)
        const studentMap = new Map<string, Student>();
        currentLocal.forEach((s) => {
          if (s && s.id) studentMap.set(s.id, s);
        });
        newStudentsList.forEach((s) => {
          studentMap.set(s.id, s);
        });
        const updatedList = Array.from(studentMap.values());

        saveStudents(updatedList);
        setStudents(updatedList);
        broadcastSyncEvent('SYNC_STUDENTS', updatedList);

        // Limpeza dos estados do modal e feedback
        setE1ParsedStudents([]);
        setUploadedFileName(null);
        setBatchNamesText('');
        setShowBatchForm(false);
        setToastMsg({
          text: `Sucesso! ${newStudentsList.length} alunos processados via Upsert sem duplicações para o Ano Letivo ${targetYear}.`,
          type: 'success',
        });
      } catch (err: any) {
        console.error('Erro na gravação em lote no Firestore:', err);
        setBatchFormError(err?.message || 'Erro ao gravar alunos no Firestore. Verifique sua conexão e tente novamente.');
      } finally {
        setIsSavingBatch(false);
      }
      return;
    }

    // Caso 2: Importação Manual por Nomes (fallback)
    const names = batchNamesText
      .split('\n')
      .map((n) => sanitizeE1String(n.trim()))
      .filter((n) => n.length > 0);

    if (names.length === 0) {
      setBatchFormError('Insira pelo menos um nome para cadastrar.');
      return;
    }
    if (!isCoordenador && currentUser && !allowedTurmas.includes(batchTurma)) {
      setBatchFormError('Você só tem permissão para importar alunos nas suas turmas vinculadas.');
      return;
    }
    setIsSavingBatch(true);
    try {
      const finalActivities = batchActivities.includes('Rotina')
        ? Array.from(new Set(batchActivities))
        : ['Rotina', ...Array.from(new Set(batchActivities))];

      if (onBatchAddStudents) {
        await Promise.resolve(
          onBatchAddStudents(names, batchTurma, finalActivities, batchDiasFrequencia)
        );
      }
      setBatchNamesText('');
      setBatchDiasFrequencia(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
      setShowBatchForm(false);
      setBatchFormError(null);
    } catch (err: any) {
      console.error('Error importing batch students:', err);
      setBatchFormError(err?.message || 'Erro ao importar alunos em lote. Tente novamente.');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditFormError(null);
    if (!editingStudent) return;
    const trimmedName = (editingStudent.name || '').trim();
    if (!trimmedName) {
      setEditFormError('O nome do aluno não pode ficar em branco.');
      return;
    }
    if (!isCoordenador && currentUser && !allowedTurmas.includes(editingStudent.turma)) {
      setEditFormError('Você só tem permissão para vincular alunos às suas turmas liberadas.');
      return;
    }

    if (editingStudent.tipoContrato === 'avulso') {
      if (!editingStudent.dataInicioContrato || !editingStudent.dataInicioContrato.trim()) {
        setEditFormError('Para contrato Avulso / Temporário, informe a Data de Início obrigatória.');
        return;
      }
      if (!editingStudent.dataTerminoContrato || !editingStudent.dataTerminoContrato.trim()) {
        setEditFormError('Para contrato Avulso / Temporário, informe a Data de Término obrigatória.');
        return;
      }
      if (editingStudent.dataInicioContrato > editingStudent.dataTerminoContrato) {
        setEditFormError('A Data de Início não pode ser posterior à Data de Término.');
        return;
      }
      if (!editingStudent.diasContratados || editingStudent.diasContratados.length === 0) {
        setEditFormError('Selecione pelo menos um Dia da Semana Contratado (Segunda a Sexta).');
        return;
      }
    }

    const hasReforco = (editingStudent.modalidadesEspeciais || editingStudent.specialties || []).includes('Reforço');
    if (hasReforco) {
      if (editingStudent.reforcoStartDate && editingStudent.reforcoEndDate && editingStudent.reforcoStartDate > editingStudent.reforcoEndDate) {
        setEditFormError('A Data de Início do Reforço não pode ser posterior à Data Final.');
        return;
      }
    }

    setIsSavingEdit(true);
    try {
      const currentActs = Array.isArray(editingStudent.activities) ? editingStudent.activities : [];
      const finalActivities = currentActs.includes('Rotina')
        ? Array.from(new Set(currentActs))
        : ['Rotina', ...Array.from(new Set(currentActs))];

      const isAvulso = editingStudent.tipoContrato === 'avulso';
      const defaultWeekDays: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      const effectiveDias: DayOfWeek[] = isAvulso
        ? (editingStudent.diasContratados && editingStudent.diasContratados.length > 0
            ? editingStudent.diasContratados
            : defaultWeekDays)
        : (editingStudent.diasFrequencia && editingStudent.diasFrequencia.length > 0
            ? editingStudent.diasFrequencia
            : defaultWeekDays);

      const newStatus = editingStudent.status || 'ativo';
      const isReactivatingToAtivo = newStatus === 'ativo';

      // Se for alterado para ativo e for avulso com contrato expirado, converte para regular
      const shouldConvertToRegular =
        isReactivatingToAtivo &&
        editingStudent.tipoContrato === 'avulso' &&
        Boolean(editingStudent.dataTerminoContrato && editingStudent.dataTerminoContrato.trim().length > 0 && editingStudent.dataTerminoContrato.trim() < toISODateString(new Date()));

      const finalTipoContrato: ContractType = shouldConvertToRegular
        ? 'regular'
        : (editingStudent.tipoContrato || 'regular');

      const studentToSave: Student = {
        ...editingStudent,
        name: trimmedName,
        turma: editingStudent.turma,
        activities: finalActivities,
        modalidadesEspeciais: hasReforco ? ['Reforço'] : [],
        specialties: hasReforco ? ['Reforço'] : [],
        reforcoStartDate: hasReforco && editingStudent.reforcoStartDate ? editingStudent.reforcoStartDate : undefined,
        reforcoEndDate: hasReforco && editingStudent.reforcoEndDate ? editingStudent.reforcoEndDate : undefined,
        tipoContrato: finalTipoContrato,
        dataInicioContrato: isAvulso && !shouldConvertToRegular ? editingStudent.dataInicioContrato : undefined,
        dataTerminoContrato: isAvulso && !shouldConvertToRegular ? editingStudent.dataTerminoContrato : undefined,
        diasContratados: isAvulso && !shouldConvertToRegular ? editingStudent.diasContratados : undefined,
        status: newStatus,
        statusMatricula: newStatus,
        inactivationDate:
          newStatus === 'inativo' || newStatus === 'cancelado'
            ? editingStudent.inactivationDate || toISODateString(new Date())
            : '',
        inactivationReason:
          newStatus === 'inativo' || newStatus === 'cancelado'
            ? editingStudent.inactivationReason
            : '',
        diasFrequencia: effectiveDias,
        horariosSaida: editingStudent.horariosSaida || {},
        anoLetivo: editingStudent.anoLetivo || 2026,
        tipoSaida: editingStudent.tipoSaida || 'PAIS',
        nomeCondutor: editingStudent.tipoSaida === 'TRANSPORTE_ESCOLAR' ? (editingStudent.nomeCondutor?.trim() || undefined) : undefined,
        planoContratual: editingStudent.planoContratual || 'Integral Semana (18:30h)',
        horarioPermanenciaLimite:
          editingStudent.horarioPermanenciaLimite ||
          getTabelaPlanosPorAno(editingStudent.anoLetivo || 2026)[editingStudent.planoContratual || 'Integral Semana (18:30h)']?.horarioPadrao ||
          '18:30h',
        valorPlanoBase:
          editingStudent.valorPlanoBase !== undefined
            ? editingStudent.valorPlanoBase
            : (getTabelaPlanosPorAno(editingStudent.anoLetivo || 2026)[editingStudent.planoContratual || 'Integral Semana (18:30h)']?.valorBase ??
                (editingStudent.anoLetivo === 2027 ? 1250 : 1120)),
        descontoBolsa: editingStudent.descontoBolsa || 0,
        valorMensalidadeFinal: Math.max(
          0,
          (editingStudent.valorPlanoBase !== undefined
            ? editingStudent.valorPlanoBase
            : (getTabelaPlanosPorAno(editingStudent.anoLetivo || 2026)[editingStudent.planoContratual || 'Integral Semana (18:30h)']?.valorBase ??
                (editingStudent.anoLetivo === 2027 ? 1250 : 1120))) -
            (editingStudent.descontoBolsa || 0)
        ),
      };
      (studentToSave as any).updatedAt = new Date().toISOString();

      await Promise.resolve(onUpdateStudent(studentToSave));
      setToastMsg({
        text: `Dados de "${trimmedName}" salvos com sucesso!`,
        type: 'success',
      });
      setEditingStudent(null);
      setOriginalStudentForEdit(null);
      setEditFormError(null);
    } catch (err: any) {
      console.error('Error saving student modifications:', err);
      setEditFormError(err?.message || 'Ocorreu um erro ao salvar os dados do aluno. Tente novamente.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleActivityInList = (
    currentList: ActivityType[],
    activity: ActivityType
  ): ActivityType[] => {
    const list = Array.isArray(currentList) ? [...currentList] : [];
    if (activity === 'Rotina') {
      // Rotina is mandatory for all students and cannot be removed
      return list.includes('Rotina') ? list : ['Rotina', ...list];
    }
    if (list.includes(activity)) {
      return list.filter((a) => a !== activity);
    } else {
      return [...list, activity];
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast de Notificação do Gerenciador de Alunos */}
      {toastMsg && (
        <div
          id="student-manager-toast"
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center space-x-3 text-xs font-bold transition-all animate-in fade-in slide-in-from-top-3 ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : 'bg-rose-950 text-rose-300 border-rose-800'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}
      {/* Top Banner and Quick Add Buttons */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              Gestão de Matrículas
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Relação de Alunos por Turma e Atividade
          </h2>
          <p className="text-xs text-slate-500">
            Cadastre os alunos por Turma do Integral e selecione em quais atividades extracurriculares cada aluno participa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => setShowNominalListModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
            title="Abrir módulo de relações nominais cadastrais de alunos e emissão de PDF limpo"
          >
            <BookMarked className="w-4 h-4 text-emerald-600" />
            <span>Gerar Relação Nominal</span>
          </button>

          {userCanManageTurmas && (
            <button
              onClick={() => setShowManageTurmasModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
              title="Adicionar ou excluir turmas"
            >
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Gerenciar / Excluir Turmas</span>
            </button>
          )}

          {userCanManageStudents && (
            <>
              <button
                id="btn-toggle-add-student"
                onClick={() => {
                  if (!showAddForm) {
                    setNewActivities(['Rotina']);
                  }
                  setShowAddForm(!showAddForm);
                  setShowBatchForm(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Novo Aluno</span>
              </button>

              <button
                onClick={() => {
                  setShowBatchForm(!showBatchForm);
                  setShowAddForm(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>+ Importar Lote (E1)</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenSanitizeModal(selectedAnoLetivo)}
                title="Sanitizar e remover cadastros duplicados no Firestore"
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border ${
                  duplicateInfoCurrentYear.totalDuplicatesCount > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md animate-pulse'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                <Eraser className="w-4 h-4 text-amber-500 hover:text-white" />
                <span>🧹 Sanitizar / Remover Alunos Duplicados</span>
                {duplicateInfoCurrentYear.totalDuplicatesCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-white text-amber-900 rounded-full text-[10px] font-black">
                    {duplicateInfoCurrentYear.totalDuplicatesCount}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Single Add Form Modal/Card */}
      {showAddForm && (
        <form
          onSubmit={handleSingleAdd}
          className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-5 space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
            <h3 className="font-bold text-indigo-900 text-sm flex items-center space-x-2">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>Cadastrar Novo Aluno</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {singleFormError && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-semibold">
              ⚠️ {singleFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome Completo do Aluno:
              </label>
              <input
                id="input-student-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Gabriel Fernandes"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Turma / Ano Escolar:
              </label>
              <select
                value={newTurma}
                onChange={(e) => setNewTurma(e.target.value as TurmaType)}
                disabled={!isCoordenador && allowedTurmas.length === 1}
                className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 ${
                  !isCoordenador && allowedTurmas.length === 1
                    ? 'bg-slate-100 cursor-not-allowed text-slate-600'
                    : 'bg-white text-slate-800'
                }`}
              >
                {turmasList.map((t, tIdx) => (
                  <option key={`${t}-${tIdx}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {!isCoordenador && allowedTurmas.length === 1 && (
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  🔒 Turma fixada conforme suas permissões de acesso.
                </p>
              )}
            </div>
          </div>

          {/* Seletor de Ano Letivo da Matrícula */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Ano Letivo da Matrícula:</span>
            </span>
            <div className="inline-flex items-center space-x-4">
              <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="radio"
                  name="novoAlunoAnoLetivo"
                  value={2026}
                  checked={newAnoLetivo === 2026}
                  onChange={() => handleChangeNewAnoLetivo(2026)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                />
                <span>2026</span>
              </label>
              <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="radio"
                  name="novoAlunoAnoLetivo"
                  value={2027}
                  checked={newAnoLetivo === 2027}
                  onChange={() => handleChangeNewAnoLetivo(2027)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                />
                <span>2027</span>
              </label>
            </div>
          </div>

          {/* Bloco Logística de Deslocamento / Saída */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span>Logística de Deslocamento / Saída:</span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Como o aluno retorna para casa
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setNewTipoSaida('PAIS')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                  newTipoSaida === 'PAIS'
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  newTipoSaida === 'PAIS' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {newTipoSaida === 'PAIS' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <span className="font-bold text-xs block text-slate-900">🚗 Pais / Responsáveis</span>
                  <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                    Saída acompanhada pelos pais ou responsáveis autorizados.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setNewTipoSaida('TRANSPORTE_ESCOLAR')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                  newTipoSaida === 'TRANSPORTE_ESCOLAR'
                    ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  newTipoSaida === 'TRANSPORTE_ESCOLAR' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {newTipoSaida === 'TRANSPORTE_ESCOLAR' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <span className="font-bold text-xs block text-slate-900">🚌 Transporte Escolar</span>
                  <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                    Van ou transporte escolar com condutor identificado.
                  </span>
                </div>
              </button>
            </div>

            {newTipoSaida === 'TRANSPORTE_ESCOLAR' && (
              <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xl space-y-1.5 animate-in fade-in duration-150">
                <label className="block text-xs font-bold text-amber-950">
                  Nome do Condutor / Tio(a) do Transporte: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newNomeCondutor}
                  onChange={(e) => setNewNomeCondutor(e.target.value)}
                  placeholder="Ex: Tio Marcos / Van 12"
                  className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-bold focus:ring-2 focus:ring-amber-500"
                  required={newTipoSaida === 'TRANSPORTE_ESCOLAR'}
                />
              </div>
            )}
          </div>

          {/* Tipo de Contrato: Regular (Contínuo) ou Avulso / Temporário */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Tipo de Contrato:</span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Selecione se a matrícula é contínua ou temporária
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setNewTipoContrato('regular')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                  newTipoContrato === 'regular'
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  newTipoContrato === 'regular' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {newTipoContrato === 'regular' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <span className="font-bold text-xs block text-slate-900">Regular (Contínuo)</span>
                  <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                    Matrícula contínua ao longo do ano letivo.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setNewTipoContrato('avulso')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                  newTipoContrato === 'avulso'
                    ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  newTipoContrato === 'avulso' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {newTipoContrato === 'avulso' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <span className="font-bold text-xs block text-slate-900">Avulso / Temporário</span>
                  <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                    Período delimitado com inativação automática pós-término.
                  </span>
                </div>
              </button>
            </div>

            {/* Campos Obrigatórios para Avulso / Temporário */}
            {newTipoContrato === 'avulso' && (
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Configuração do Período e Dias Contratados (Obrigatórios):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Data de Início: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={newDataInicio}
                      onChange={(e) => setNewDataInicio(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Data de Término: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={newDataTermino}
                      onChange={(e) => setNewDataTermino(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Dias da Semana Contratados */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Dias da Semana Contratados: <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setNewDiasContratados(['segunda', 'terca', 'quarta', 'quinta', 'sexta'])}
                        className="text-[10px] font-bold text-amber-800 bg-white hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-300 shadow-2xs"
                      >
                        Seg a Sex
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewDiasContratados(['segunda', 'quarta', 'sexta'])}
                        className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                      >
                        Seg / Qua / Sex
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewDiasContratados(['terca', 'quinta'])}
                        className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                      >
                        Ter / Qui
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { id: 'segunda' as DayOfWeek, label: 'Segunda', short: 'Seg' },
                      { id: 'terca' as DayOfWeek, label: 'Terça', short: 'Ter' },
                      { id: 'quarta' as DayOfWeek, label: 'Quarta', short: 'Qua' },
                      { id: 'quinta' as DayOfWeek, label: 'Quinta', short: 'Qui' },
                      { id: 'sexta' as DayOfWeek, label: 'Sexta', short: 'Sex' },
                    ].map((d) => {
                      const isSelected = newDiasContratados.includes(d.id);
                      return (
                        <button
                          type="button"
                          key={d.id}
                          onClick={() => setNewDiasContratados(toggleDayInList(newDiasContratados, d.id))}
                          className={`py-1.5 px-1 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50'
                          }`}
                        >
                          <span className="hidden sm:inline">{d.label}</span>
                          <span className="sm:hidden">{d.short}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[10.5px] text-amber-900 leading-relaxed pt-0.5">
                  ℹ️ <strong>Regra do Contrato Avulso:</strong> O aluno constará na chamada estritamente entre {formatDateBR(newDataInicio)} e {formatDateBR(newDataTermino)} nos dias contratados. Após {formatDateBR(newDataTermino)}, o aluno será inativado automaticamente como <em>"Contrato Concluído"</em>, preservando todo o histórico de chamadas passadas.
                </p>
              </div>
            )}
          </div>

          {/* Estrutura Financeira dos Planos Contratuais (Válida para 2026 e 2027) */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-emerald-200/70 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                  <BadgeDollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">
                    Plano Contratual & Condição Financeira
                  </h4>
                  <p className="text-[11px] text-emerald-700">
                    Tabela oficial de mensalidades com sincronização automática no Módulo Financeiro
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Exercício {newAnoLetivo}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Seletor do Plano Contratual */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Plano Contratual Oficial: <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newPlanoContratual}
                  onChange={(e) => handleSelectNewPlano(e.target.value as PlanoContratualType)}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                >
                  {(() => {
                    const currentYearTabela = getTabelaPlanosPorAno(newAnoLetivo);
                    return (Object.keys(currentYearTabela) as PlanoContratualType[]).map((planoKey) => {
                      const info = currentYearTabela[planoKey];
                      return (
                        <option key={planoKey} value={planoKey}>
                          {planoKey} {planoKey !== 'Personalizado' ? `— ${formatCurrencyBR(info.valorBase)}` : '(Livre)'}
                        </option>
                      );
                    });
                  })()}
                </select>
                <p className="text-[10.5px] text-emerald-800 mt-1">
                  {getTabelaPlanosPorAno(newAnoLetivo)[newPlanoContratual]?.descricao || 'Configuração customizada'}
                </p>
              </div>

              {/* Horário Limite de Permanência */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Horário Limite de Permanência: <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newHorarioPermanenciaLimite}
                    onChange={(e) => setNewHorarioPermanenciaLimite(e.target.value)}
                    placeholder="Ex: 18:30h ou 14:00h"
                    className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                  <Clock className="w-4 h-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[10.5px] text-slate-500 mt-1">
                  Preenchido automaticamente pelo plano selecionado
                </p>
              </div>
            </div>

            {/* Valores Financeiros: Base, Desconto/Bolsa e Mensalidade Final */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
                  Valor Base (Tabela R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newValorPlanoBase}
                  onChange={(e) => setNewValorPlanoBase(parseFloat(e.target.value) || 0)}
                  disabled={newPlanoContratual !== 'Personalizado'}
                  className={`w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg ${
                    newPlanoContratual === 'Personalizado'
                      ? 'bg-white border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                      : 'bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed'
                  }`}
                />
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
                  Desconto / Bolsa (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newDescontoBolsa}
                  onChange={(e) => setNewDescontoBolsa(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-emerald-400 text-slate-900 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-xs flex flex-col justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                  Mensalidade Final:
                </span>
                <span className="text-base font-extrabold text-white mt-0.5">
                  {formatCurrencyBR(newValorMensalidadeFinal)}
                </span>
                <span className="text-[9.5px] text-emerald-200">
                  Base - Bolsa ({formatCurrencyBR(newValorPlanoBase)} - {formatCurrencyBR(newDescontoBolsa)})
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Atividades Extracurriculares (Apenas com Chamada):
              </label>
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                  Inclusas no Plano Contratual
                </span>
                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  {extracurricularRollCallActivities.length} modalidades oficiais
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {extracurricularRollCallActivities.map((act) => {
                const isSelected = newActivities.includes(act.id);
                const isRotina = act.id === 'Rotina';
                return (
                  <button
                    type="button"
                    key={act.id}
                    disabled={isSavingSingle}
                    onClick={() =>
                      setNewActivities(toggleActivityInList(newActivities, act.id))
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center space-x-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    } ${isRotina ? 'ring-2 ring-rose-400' : ''}`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{act.name || act.id} {isRotina ? '(Obrigatória)' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modalidade Paralela Especial: Reforço Escolar */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-amber-950">Modalidade Paralela • Reforço Escolar:</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                Reforço vs. Lego/Oficinas
              </span>
            </div>
            <p className="text-[11px] text-amber-900 leading-snug">
              Marque se este aluno frequenta a sala de <strong>Reforço Escolar</strong> no contraturno em horários paralelos (ex: Lego / Oficinas).
            </p>
            <label className="flex items-center space-x-2.5 bg-white p-2.5 rounded-xl border border-amber-300 cursor-pointer hover:bg-amber-100/50 transition-colors">
              <input
                type="checkbox"
                checked={newHasReforco}
                onChange={(e) => setNewHasReforco(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-amber-300 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <BookMarked className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Aluno frequenta a modalidade 'Reforço' (destaque automático nas Atividades do Momento e Chamada de Frequência)</span>
              </span>
            </label>
            {newHasReforco && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in duration-150">
                <div>
                  <label className="block text-[11px] font-bold text-amber-950 mb-1">
                    Data de Início do Reforço:
                  </label>
                  <input
                    type="date"
                    value={newReforcoStartDate}
                    onChange={(e) => setNewReforcoStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-amber-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-950 mb-1">
                    Data Final do Reforço:
                  </label>
                  <input
                    type="date"
                    value={newReforcoEndDate}
                    onChange={(e) => setNewReforcoEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-amber-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dias de Frequência no Programa Integral */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <span>Dias de Frequência e Horários de Saída:</span>
              </label>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setNewDiasFrequencia(['segunda', 'terca', 'quarta', 'quinta', 'sexta'])}
                  className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 shadow-2xs"
                >
                  Seg a Sex
                </button>
                <button
                  type="button"
                  onClick={() => setNewDiasFrequencia(['segunda', 'quarta', 'sexta'])}
                  className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs"
                >
                  Seg / Qua / Sex
                </button>
                <button
                  type="button"
                  onClick={() => setNewDiasFrequencia(['terca', 'quinta'])}
                  className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs"
                >
                  Ter / Qui
                </button>
              </div>
            </div>

            {/* Quick time fill buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-indigo-100/60">
              <span className="text-[10px] font-semibold text-slate-600 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-indigo-500" />
                <span>Atalho de Saída (dias marcados):</span>
              </span>
              {['17:00', '17:30', '18:00', '18:30', '19:00'].map((presetTime) => (
                <button
                  key={presetTime}
                  type="button"
                  onClick={() => {
                    const updated: Partial<Record<DayOfWeek, string>> = { ...newHorariosSaida };
                    newDiasFrequencia.forEach((day) => {
                      updated[day] = presetTime;
                    });
                    setNewHorariosSaida(updated);
                  }}
                  className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shadow-2xs"
                  title={`Definir saída às ${presetTime} para os dias selecionados`}
                >
                  {presetTime}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 pt-1">
              {[
                { id: 'segunda' as DayOfWeek, label: 'Segunda', short: 'Seg' },
                { id: 'terca' as DayOfWeek, label: 'Terça', short: 'Ter' },
                { id: 'quarta' as DayOfWeek, label: 'Quarta', short: 'Qua' },
                { id: 'quinta' as DayOfWeek, label: 'Quinta', short: 'Qui' },
                { id: 'sexta' as DayOfWeek, label: 'Sexta', short: 'Sex' },
              ].map((d) => {
                const isSelected = newDiasFrequencia.includes(d.id);
                return (
                  <div key={d.id} className="flex flex-col space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setNewDiasFrequencia(toggleDayInList(newDiasFrequencia, d.id))}
                      className={`py-1.5 px-1 sm:px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer w-full ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="hidden sm:inline">{d.label}</span>
                      <span className="sm:hidden">{d.short}</span>
                    </button>

                    {isSelected ? (
                      <div className="flex flex-col bg-white border border-indigo-200 rounded-xl p-1 shadow-2xs focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                        <span className="text-[9px] font-extrabold uppercase tracking-tight text-indigo-700 text-center block mb-0.5">
                          Saída
                        </span>
                        <input
                          type="time"
                          value={newHorariosSaida[d.id] || ''}
                          onChange={(e) =>
                            setNewHorariosSaida({
                              ...newHorariosSaida,
                              [d.id]: e.target.value,
                            })
                          }
                          className="w-full text-center text-xs font-bold text-slate-900 bg-transparent outline-none p-0 cursor-pointer"
                          title={`Horário de saída na ${d.label}`}
                        />
                      </div>
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center py-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-100/60 text-slate-400 select-none"
                        title="Não frequenta neste dia"
                      >
                        <span className="text-[9px] font-medium text-slate-400">Folga</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium">
              💡 O aluno constará na chamada diária exclusivamente nos dias marcados, com o horário de saída específico cadastrado.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-indigo-100">
            <button
              type="button"
              disabled={isSavingSingle}
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              id="btn-submit-add-student"
              type="submit"
              disabled={isSavingSingle}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5 transition-all"
            >
              {isSavingSingle ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvar Aluno</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Batch Add Form Modal/Card */}
      {showBatchForm && (
        <form
          onSubmit={handleBatchAddSubmit}
          className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 animate-in fade-in duration-150"
        >
          <div className="border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-indigo-300 text-sm flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Importação de Alunos em Lote — Sistema E1</span>
              </h3>
              <button
                type="button"
                disabled={isSavingBatch}
                onClick={() => {
                  setShowBatchForm(false);
                  setUploadedFileName(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Selecione ou arraste o arquivo .xls exportado do relatório de turmas do Sistema E1.
            </p>
          </div>

          {batchFormError && (
            <div className="p-3 text-xs bg-rose-900/50 border border-rose-700 text-rose-200 rounded-xl font-semibold">
              ⚠️ {batchFormError}
            </div>
          )}

          {e1ParsedStudents.length > 0 ? (
            <div className="bg-indigo-950/70 border border-indigo-700/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-lg shrink-0 mt-0.5">
                  <School className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-indigo-200">
                      Modo Multi-Turmas (Sistema E1 Reconhecido)
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30">
                      Automático
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    A turma de cada aluno será vinculada dinamicamente com base nas <strong>{Object.keys(e1TurmaCounts).length} turmas</strong> do relatório para o Ano Letivo <strong>{selectedAnoLetivo}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setE1ParsedStudents([]);
                  setUploadedFileName(null);
                  setBatchNamesText('');
                }}
                className="text-xs text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/50 px-2.5 py-1.5 rounded-lg border border-rose-800 transition-colors shrink-0 font-semibold cursor-pointer"
              >
                Limpar / Descartar
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Turma de Destino:
                </label>
                <select
                  value={batchTurma}
                  onChange={(e) => setBatchTurma(e.target.value as TurmaType)}
                  disabled={isSavingBatch || (!isCoordenador && allowedTurmas.length === 1)}
                  className={`w-full px-3 py-2 text-sm border border-slate-700 bg-slate-800 text-white rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium ${
                    !isCoordenador && allowedTurmas.length === 1 ? 'opacity-75 cursor-not-allowed' : ''
                  }`}
                >
                  {turmasList.map((t, tIdx) => (
                    <option key={`${t}-${tIdx}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {!isCoordenador && allowedTurmas.length === 1 && (
                  <p className="text-[11px] text-slate-400 mt-1 font-medium">
                    🔒 Turma fixada conforme suas permissões de acesso.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Atividades com Chamada (Turma):
                  </label>
                  <span className="text-[10px] text-indigo-300 font-medium">
                    {extracurricularRollCallActivities.filter(a => a.id !== 'Rotina').length} opções
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {extracurricularRollCallActivities.map((act) => {
                    const isSelected = batchActivities.includes(act.id);
                    return (
                      <button
                        type="button"
                        key={act.id}
                        disabled={isSavingBatch}
                        onClick={() =>
                          setBatchActivities(toggleActivityInList(batchActivities, act.id))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                          isSelected
                            ? 'bg-indigo-500 text-white border-indigo-400'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {act.name || act.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Batch Dias de Frequência */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="block text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dias de Frequência para os Alunos do Lote:</span>
              </label>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setBatchDiasFrequencia(['segunda', 'terca', 'quarta', 'quinta', 'sexta'])}
                  className="text-[10px] font-bold text-indigo-300 bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded border border-slate-600"
                >
                  Seg a Sex
                </button>
                <button
                  type="button"
                  onClick={() => setBatchDiasFrequencia(['segunda', 'quarta', 'sexta'])}
                  className="text-[10px] font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded border border-slate-600"
                >
                  Seg/Qua/Sex
                </button>
                <button
                  type="button"
                  onClick={() => setBatchDiasFrequencia(['terca', 'quinta'])}
                  className="text-[10px] font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded border border-slate-600"
                >
                  Ter/Qui
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {[
                { id: 'segunda' as DayOfWeek, label: 'Segunda', short: 'Seg' },
                { id: 'terca' as DayOfWeek, label: 'Terça', short: 'Ter' },
                { id: 'quarta' as DayOfWeek, label: 'Quarta', short: 'Qua' },
                { id: 'quinta' as DayOfWeek, label: 'Quinta', short: 'Qui' },
                { id: 'sexta' as DayOfWeek, label: 'Sexta', short: 'Sex' },
              ].map((d) => {
                const isSelected = batchDiasFrequencia.includes(d.id);
                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setBatchDiasFrequencia(toggleDayInList(batchDiasFrequencia, d.id))}
                    className={`py-1 px-1.5 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="hidden sm:inline">{d.label}</span>
                    <span className="sm:hidden">{d.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dropzone do Arquivo .xls Sistema E1 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                handleProcessFile(file);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
              isDraggingFile
                ? 'border-indigo-400 bg-indigo-950/40'
                : 'border-slate-700 hover:border-indigo-500 bg-slate-800/50 hover:bg-slate-800'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleProcessFile(file);
                }
              }}
            />
            <div className="flex flex-col items-center justify-center space-y-1">
              <Upload className="w-5 h-5 text-indigo-400" />
              <p className="text-xs font-semibold text-slate-200">
                {uploadedFileName ? (
                  <span className="text-emerald-400 font-bold">Arquivo carregado: {uploadedFileName}</span>
                ) : (
                  <span>Clique para selecionar ou arraste o arquivo <strong className="text-indigo-300">.xls</strong> do Sistema E1</span>
                )}
              </p>
              <p className="text-[11px] text-slate-400">
                O relatório de turmas será processado dinamicamente vinculando cada aluno à sua respectiva turma.
              </p>
            </div>
          </div>

          {/* Pré-visualização Detalhada do Sistema E1 (129 alunos em 10 turmas) */}
          {e1ParsedStudents.length > 0 && (
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-700/80 gap-2">
                <div className="flex items-center space-x-2">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300">
                    Pré-visualização da Importação ({e1ParsedStudents.length} alunos encontrados em {Object.keys(e1TurmaCounts).length} turmas)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  Ano Letivo Ativo: <strong className="text-white">{selectedAnoLetivo}</strong>
                </span>
              </div>

              {/* Lista expansível de total por turma */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400 font-medium">
                  Clique em uma turma para expandir e verificar os alunos identificados:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {Object.entries(e1TurmaCounts).map(([turmaName, count]) => {
                    const isExpanded = expandedTurmaDetails === turmaName;
                    const studentsInThisTurma = e1ParsedStudents.filter((s) => s.turma === turmaName);

                    return (
                      <div
                        key={turmaName}
                        className={`border rounded-xl transition-colors overflow-hidden ${
                          isExpanded ? 'border-indigo-500 bg-slate-900' : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedTurmaDetails(isExpanded ? null : turmaName)}
                          className="w-full flex items-center justify-between p-2.5 text-left cursor-pointer"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                            <span className="text-xs font-bold text-slate-200 truncate">{turmaName}</span>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                              {count} {count === 1 ? 'aluno' : 'alunos'}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-2.5 pt-0 border-t border-slate-800/80 mt-1 max-h-32 overflow-y-auto">
                            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 font-mono">
                              {studentsInThisTurma.map((st, i) => (
                                <li key={i} className="truncate flex items-center justify-between py-0.5">
                                  <span>{st.name}</span>
                                  {st.matricula && !st.matricula.startsWith('st-') && (
                                    <span className="text-[10px] text-emerald-300 bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 rounded font-sans font-semibold shrink-0 ml-2">
                                      Matrícula: {st.matricula}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {e1ParsedStudents.length > 0
                ? `Relação de Nomes dos Alunos (${e1ParsedStudents.length} alunos extraídos do relatório):`
                : 'Relação de Nomes dos Alunos (1 nome por linha):'}
            </label>
            <textarea
              rows={4}
              placeholder={`Exemplo:\nAna Julia Santos\nBruno Henrique Lima\nCarolina Mendes\nDaniel Oliveira`}
              value={batchNamesText}
              disabled={isSavingBatch}
              onChange={(e) => setBatchNamesText(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-700 bg-slate-800 text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              required={e1ParsedStudents.length === 0}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={isSavingBatch}
              onClick={() => {
                setShowBatchForm(false);
                setE1ParsedStudents([]);
                setUploadedFileName(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingBatch}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5 transition-all"
            >
              {isSavingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {e1ParsedStudents.length > 0
                      ? `Gravando ${e1ParsedStudents.length} Alunos no Firestore...`
                      : 'Importando...'}
                  </span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {e1ParsedStudents.length > 0
                      ? `Importar ${e1ParsedStudents.length} Alunos (Ano ${selectedAnoLetivo})`
                      : 'Importar Alunos'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4">
          <form
            onSubmit={handleEditSave}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in duration-150 overflow-hidden"
          >
            {/* Modal Header (Fixed at top) */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 shrink-0 bg-white">
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                <span>Editar Cadastro do Aluno</span>
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleOpenFichaMatriculaPDF(editingStudent)}
                  className="px-2.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer flex items-center space-x-1.5 transition-colors shadow-2xs"
                  title="Emitir Ficha Cadastral de Matrícula e Termo de Autorização de Saída (PDF)"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>📄 Ficha de Matrícula (PDF)</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => {
                    setEditingStudent(null);
                    setOriginalStudentForEdit(null);
                    setEditFormError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto max-h-[75vh] p-4 sm:p-6 space-y-4">
              {editFormError && (
                <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-semibold">
                  ⚠️ {editFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Aluno:
                </label>
                <input
                  type="text"
                  value={editingStudent.name ?? ''}
                  disabled={isSavingEdit}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Turma:
                </label>
                <select
                  value={editingStudent.turma || ''}
                  onChange={(e) =>
                    setEditingStudent((prev) => prev ? { ...prev, turma: e.target.value as TurmaType } : null)
                  }
                  disabled={isSavingEdit || (!isCoordenador && allowedTurmas.length === 1 && editingStudent.anoLetivo !== 2027)}
                  className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-medium ${
                    !isCoordenador && allowedTurmas.length === 1 && editingStudent.anoLetivo !== 2027
                      ? 'bg-slate-100 cursor-not-allowed text-slate-600'
                      : 'text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500'
                  }`}
                >
                  {editTurmasList.map((t, tIdx) => (
                    <option key={`${t}-${tIdx}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {!isCoordenador && allowedTurmas.length === 1 && editingStudent.anoLetivo !== 2027 && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    🔒 Turma fixada conforme suas permissões de acesso.
                  </p>
                )}
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-blue-800">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Preservação de Histórico ao Transferir:</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed pl-5">
                    Ao trocar a turma do aluno, todas as chamadas e lançamentos anteriores de frequência, presenças e ocorrências são <strong>mantidos integralmente</strong> associados ao histórico individual dele.
                  </p>
                </div>
              </div>

              {/* Seletor de Ano Letivo da Matrícula */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Ano Letivo da Matrícula:</span>
                </span>
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    id="btn-edit-ano-2026"
                    disabled={isSavingEdit}
                    onClick={() => handleToggleEditAnoLetivo(2026)}
                    className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                      editingStudent.anoLetivo === 2026
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 bg-transparent'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editAlunoAnoLetivo"
                      value={2026}
                      checked={editingStudent.anoLetivo === 2026}
                      onChange={() => handleToggleEditAnoLetivo(2026)}
                      className="w-3.5 h-3.5 text-indigo-600 focus:ring-0 border-slate-300 cursor-pointer"
                    />
                    <span>2026</span>
                  </button>
                  <button
                    type="button"
                    id="btn-edit-ano-2027"
                    disabled={isSavingEdit}
                    onClick={() => handleToggleEditAnoLetivo(2027)}
                    className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                      editingStudent.anoLetivo === 2027
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 bg-transparent'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editAlunoAnoLetivo"
                      value={2027}
                      checked={editingStudent.anoLetivo === 2027}
                      onChange={() => handleToggleEditAnoLetivo(2027)}
                      className="w-3.5 h-3.5 text-indigo-600 focus:ring-0 border-slate-300 cursor-pointer"
                    />
                    <span>2027</span>
                  </button>
                </div>
              </div>
              {editingStudent.anoLetivo === 2027 && (
                <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs text-indigo-900 space-y-1 animate-in fade-in duration-150">
                  <div className="flex items-center space-x-1.5 font-bold text-indigo-800">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Preparando Rematrícula para 2027:</span>
                  </div>
                  <p className="text-[11px] text-indigo-950/80 leading-relaxed pl-5">
                    Turma promovida para <strong>{editingStudent.turma}</strong>. Modalidades resetadas para <em>Rotina</em> e horários de saída liberados para preenchimento.
                  </p>
                </div>
              )}

              {/* Bloco Logística de Deslocamento / Saída */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <span>Logística de Deslocamento / Saída:</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Como o aluno retorna para casa
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => setEditingStudent({ ...editingStudent, tipoSaida: 'PAIS' })}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                      (editingStudent.tipoSaida || 'PAIS') === 'PAIS'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      (editingStudent.tipoSaida || 'PAIS') === 'PAIS' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {(editingStudent.tipoSaida || 'PAIS') === 'PAIS' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <span className="font-bold text-xs block text-slate-900">🚗 Pais / Responsáveis</span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        Saída acompanhada pelos pais ou responsáveis.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => setEditingStudent({ ...editingStudent, tipoSaida: 'TRANSPORTE_ESCOLAR' })}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                      editingStudent.tipoSaida === 'TRANSPORTE_ESCOLAR'
                        ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      editingStudent.tipoSaida === 'TRANSPORTE_ESCOLAR' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {editingStudent.tipoSaida === 'TRANSPORTE_ESCOLAR' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <span className="font-bold text-xs block text-slate-900">🚌 Transporte Escolar</span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        Van ou transporte escolar com condutor identificado.
                      </span>
                    </div>
                  </button>
                </div>

                {editingStudent.tipoSaida === 'TRANSPORTE_ESCOLAR' && (
                  <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xl space-y-1.5 animate-in fade-in duration-150">
                    <label className="block text-xs font-bold text-amber-950">
                      Nome do Condutor / Tio(a) do Transporte: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isSavingEdit}
                      value={editingStudent.nomeCondutor || ''}
                      onChange={(e) => setEditingStudent({ ...editingStudent, nomeCondutor: e.target.value })}
                      placeholder="Ex: Tio Marcos / Van 12"
                      className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-bold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Status do Aluno: Ativo / Inativo / Cancelado */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <label className="block text-xs font-bold text-slate-800">
                  Situação da Matrícula (Status do Aluno):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ativo' as StudentStatus, label: 'Ativo', desc: 'Frequência regular', color: 'bg-emerald-500 text-white border-emerald-600', activeBg: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
                    { id: 'inativo' as StudentStatus, label: 'Inativo', desc: 'Afastamento temporário', color: 'bg-slate-600 text-white border-slate-700', activeBg: 'bg-slate-100 text-slate-800 border-slate-300' },
                    { id: 'cancelado' as StudentStatus, label: 'Cancelado', desc: 'Matrícula cancelada', color: 'bg-rose-600 text-white border-rose-700', activeBg: 'bg-rose-50 text-rose-800 border-rose-300' },
                  ].map((st) => {
                    const currentStatus = editingStudent.status || 'ativo';
                    const isSelected = currentStatus === st.id;
                    return (
                      <button
                        type="button"
                        key={st.id}
                        disabled={isSavingEdit}
                        onClick={() =>
                          setEditingStudent({
                            ...editingStudent,
                            status: st.id,
                            inactivationDate:
                              st.id !== 'ativo' && !editingStudent.inactivationDate
                                ? toISODateString(new Date())
                                : editingStudent.inactivationDate,
                          })
                        }
                        className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex flex-col items-center justify-center ${
                          isSelected
                            ? `${st.color} shadow-xs`
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs font-extrabold">{st.label}</span>
                        <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'opacity-90 text-white' : 'text-slate-400'}`}>
                          {st.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {(editingStudent.status === 'inativo' || editingStudent.status === 'cancelado') && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 mt-2">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Detalhes da Inativação / Cancelamento:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Data de Inativação / Saída:
                        </label>
                        <input
                          type="date"
                          value={editingStudent.inactivationDate || toISODateString(new Date())}
                          onChange={(e) =>
                            setEditingStudent({
                              ...editingStudent,
                              inactivationDate: e.target.value,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Motivo / Observação:
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Mudança de escola, ajuste de grade..."
                          value={editingStudent.inactivationReason || ''}
                          onChange={(e) =>
                            setEditingStudent({
                              ...editingStudent,
                              inactivationReason: e.target.value,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-medium"
                        />
                      </div>
                    </div>
                    <p className="text-[10.5px] text-amber-800 leading-relaxed">
                      ℹ️ O aluno não aparecerá na chamada a partir desta data. Todo o histórico anterior será <strong>preservado integralmente</strong> para relatórios passados.
                    </p>
                  </div>
                )}
              </div>

              {/* Tipo de Contrato: Regular (Contínuo) ou Avulso / Temporário */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>Tipo de Contrato:</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Modalidade de matrícula do aluno
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() =>
                      setEditingStudent({
                        ...editingStudent,
                        tipoContrato: 'regular',
                      })
                    }
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                      (editingStudent.tipoContrato || 'regular') === 'regular'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      (editingStudent.tipoContrato || 'regular') === 'regular'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}>
                      {(editingStudent.tipoContrato || 'regular') === 'regular' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-xs block text-slate-900">Regular (Contínuo)</span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        Matrícula padrão contínua ao longo do ano letivo.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => {
                      const today = toISODateString(new Date());
                      setEditingStudent({
                        ...editingStudent,
                        tipoContrato: 'avulso',
                        dataInicioContrato: editingStudent.dataInicioContrato || today,
                        dataTerminoContrato: editingStudent.dataTerminoContrato || today,
                        diasContratados:
                          editingStudent.diasContratados && editingStudent.diasContratados.length > 0
                            ? editingStudent.diasContratados
                            : editingStudent.diasFrequencia && editingStudent.diasFrequencia.length > 0
                            ? editingStudent.diasFrequencia
                            : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
                      });
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                      editingStudent.tipoContrato === 'avulso'
                        ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      editingStudent.tipoContrato === 'avulso'
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}>
                      {editingStudent.tipoContrato === 'avulso' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-xs block text-slate-900">Avulso / Temporário</span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        Período delimitado com inativação automática pós-término.
                      </span>
                    </div>
                  </button>
                </div>

                {editingStudent.tipoContrato === 'avulso' && (
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Configuração do Período e Dias Contratados (Obrigatórios):</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Data de Início: <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={editingStudent.dataInicioContrato || toISODateString(new Date())}
                          disabled={isSavingEdit}
                          onChange={(e) =>
                            setEditingStudent({
                              ...editingStudent,
                              dataInicioContrato: e.target.value,
                            })
                          }
                          required
                          className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Data de Término: <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={editingStudent.dataTerminoContrato || toISODateString(new Date())}
                          disabled={isSavingEdit}
                          onChange={(e) =>
                            setEditingStudent({
                              ...editingStudent,
                              dataTerminoContrato: e.target.value,
                            })
                          }
                          required
                          className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {/* Dias da Semana Contratados */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Dias da Semana Contratados: <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingStudent({
                                ...editingStudent,
                                diasContratados: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
                              })
                            }
                            className="text-[10px] font-bold text-amber-800 bg-white hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-300 shadow-2xs"
                          >
                            Seg a Sex
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingStudent({
                                ...editingStudent,
                                diasContratados: ['segunda', 'quarta', 'sexta'],
                              })
                            }
                            className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                          >
                            Seg / Qua / Sex
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingStudent({
                                ...editingStudent,
                                diasContratados: ['terca', 'quinta'],
                              })
                            }
                            className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                          >
                            Ter / Qui
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { id: 'segunda' as DayOfWeek, label: 'Segunda', short: 'Seg' },
                          { id: 'terca' as DayOfWeek, label: 'Terça', short: 'Ter' },
                          { id: 'quarta' as DayOfWeek, label: 'Quarta', short: 'Qua' },
                          { id: 'quinta' as DayOfWeek, label: 'Quinta', short: 'Qui' },
                          { id: 'sexta' as DayOfWeek, label: 'Sexta', short: 'Sex' },
                        ].map((d) => {
                          const currentContratados =
                            editingStudent.diasContratados && editingStudent.diasContratados.length > 0
                              ? editingStudent.diasContratados
                              : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
                          const isSelected = currentContratados.includes(d.id);
                          return (
                            <button
                              type="button"
                              key={d.id}
                              disabled={isSavingEdit}
                              onClick={() =>
                                setEditingStudent({
                                  ...editingStudent,
                                  diasContratados: toggleDayInList(editingStudent.diasContratados, d.id),
                                })
                              }
                              className={`py-1.5 px-1 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50'
                              }`}
                            >
                              <span className="hidden sm:inline">{d.label}</span>
                              <span className="sm:hidden">{d.short}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <p className="text-[10.5px] text-amber-900 leading-relaxed pt-0.5">
                      ℹ️ O aluno constará na chamada estritamente entre {formatDateBR(editingStudent.dataInicioContrato || '')} e {formatDateBR(editingStudent.dataTerminoContrato || '')} nos dias contratados. Após {formatDateBR(editingStudent.dataTerminoContrato || '')}, será inativado como <em>"Contrato Concluído"</em>, preservando todo o histórico anterior.
                    </p>
                  </div>
                )}
              </div>

              {/* Estrutura Financeira dos Planos Contratuais (Válida para 2026 e 2027) */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-emerald-200/70 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                      <BadgeDollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950">
                        Plano Contratual & Condição Financeira
                      </h4>
                      <p className="text-[11px] text-emerald-700">
                        Tabela oficial de mensalidades com sincronização automática no Módulo Financeiro
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Exercício {editingStudent.anoLetivo}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Seletor do Plano Contratual */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Plano Contratual Oficial: <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editingStudent.planoContratual || 'Integral Semana (18:30h)'}
                      onChange={(e) => handleSelectEditPlano(e.target.value as PlanoContratualType)}
                      disabled={isSavingEdit}
                      className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                    >
                      {(() => {
                        const editTabela = getTabelaPlanosPorAno(editingStudent.anoLetivo);
                        return (Object.keys(editTabela) as PlanoContratualType[]).map((planoKey) => {
                          const info = editTabela[planoKey];
                          return (
                            <option key={planoKey} value={planoKey}>
                              {planoKey} {planoKey !== 'Personalizado' ? `— ${formatCurrencyBR(info.valorBase)}` : '(Livre)'}
                            </option>
                          );
                        });
                      })()}
                    </select>
                    <p className="text-[10.5px] text-emerald-800 mt-1">
                      {getTabelaPlanosPorAno(editingStudent.anoLetivo)[
                        editingStudent.planoContratual || 'Integral Semana (18:30h)'
                      ]?.descricao || 'Configuração customizada'}
                    </p>
                  </div>

                  {/* Horário Limite de Permanência */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Horário Limite de Permanência: <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editingStudent.horarioPermanenciaLimite || '18:30h'}
                        onChange={(e) => setEditingStudent({ ...editingStudent, horarioPermanenciaLimite: e.target.value })}
                        disabled={isSavingEdit}
                        placeholder="Ex: 18:30h ou 14:00h"
                        className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        required
                      />
                      <Clock className="w-4 h-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[10.5px] text-slate-500 mt-1">
                      Preenchido automaticamente pelo plano selecionado
                    </p>
                  </div>
                </div>

                {/* Valores Financeiros: Base, Desconto/Bolsa e Mensalidade Final */}
                {(() => {
                  const editTabela = getTabelaPlanosPorAno(editingStudent.anoLetivo);
                  const defaultEditBase =
                    editTabela[editingStudent.planoContratual || 'Integral Semana (18:30h)']?.valorBase ??
                    (editingStudent.anoLetivo === 2027 ? 1250 : 1120);
                  const currentBase = editingStudent.valorPlanoBase ?? defaultEditBase;
                  const currentDesconto = editingStudent.descontoBolsa ?? 0;
                  const currentFinal = Math.max(0, currentBase - currentDesconto);

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                        <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
                          Valor Base (Tabela R$):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={currentBase ?? 0}
                          onChange={(e) => handleChangeEditBase(parseFloat(e.target.value) || 0)}
                          disabled={isSavingEdit || (editingStudent.planoContratual || 'Integral Semana (18:30h)') !== 'Personalizado'}
                          className={`w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg ${
                            editingStudent.planoContratual === 'Personalizado'
                              ? 'bg-white border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-500'
                              : 'bg-slate-50 border-slate-200 text-slate-700 cursor-not-allowed'
                          }`}
                        />
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                        <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
                          Desconto / Bolsa (R$):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={currentDesconto ?? 0}
                          onChange={(e) => handleChangeEditDesconto(parseFloat(e.target.value) || 0)}
                          disabled={isSavingEdit}
                          placeholder="0,00"
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-emerald-400 text-slate-900 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-xs flex flex-col justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                          Mensalidade Final:
                        </span>
                        <span className="text-base font-extrabold text-white mt-0.5">
                          {formatCurrencyBR(currentFinal)}
                        </span>
                        <span className="text-[9.5px] text-emerald-200">
                          Base - Bolsa ({formatCurrencyBR(currentBase)} - {formatCurrencyBR(currentDesconto)})
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Atividades Extracurriculares (Apenas com Chamada):
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      Inclusas no Plano Contratual
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {extracurricularRollCallActivities.length} modalidades oficiais
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
                  {extracurricularRollCallActivities.map((act) => {
                    const isChecked = (editingStudent.activities || []).includes(act.id);
                    const isRotina = act.id === 'Rotina';
                    return (
                      <button
                        type="button"
                        key={act.id}
                        disabled={isSavingEdit}
                        onClick={() =>
                          setEditingStudent({
                            ...editingStudent,
                            activities: toggleActivityInList(editingStudent.activities, act.id),
                          })
                        }
                        className={`p-2 rounded-xl text-xs font-semibold border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-50 text-indigo-900 border-indigo-300 font-bold shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        } ${isRotina ? 'border-rose-300 bg-rose-50/50' : ''}`}
                      >
                        <div className="flex items-center space-x-1.5 truncate">
                          <ActivityBadge activity={act.id} size="sm" iconName={act.icon} customIconUrl={act.customIconUrl} />
                          {isRotina && <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded-full font-bold">Obrigatória</span>}
                        </div>
                        <span className="text-indigo-600 font-bold ml-1">{isChecked ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modalidade Paralela Especial: Reforço Escolar */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs font-bold text-amber-950">Modalidade Paralela • Reforço Escolar:</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Reforço vs. Lego/Oficinas
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 leading-snug">
                  Marque se este aluno frequenta a sala de <strong>Reforço Escolar</strong> no contraturno em horários paralelos (ex: Lego / Oficinas).
                </p>
                <label className="flex items-center space-x-2.5 bg-white p-2.5 rounded-xl border border-amber-300 cursor-pointer hover:bg-amber-100/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={(editingStudent.modalidadesEspeciais || editingStudent.specialties || []).includes('Reforço')}
                    onChange={(e) => {
                      const current = editingStudent.modalidadesEspeciais || editingStudent.specialties || [];
                      const next = e.target.checked
                        ? Array.from(new Set([...current, 'Reforço']))
                        : current.filter((m) => m !== 'Reforço');
                      setEditingStudent({
                        ...editingStudent,
                        modalidadesEspeciais: next,
                        specialties: next,
                        reforcoStartDate: e.target.checked ? editingStudent.reforcoStartDate : '',
                        reforcoEndDate: e.target.checked ? editingStudent.reforcoEndDate : '',
                      });
                    }}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-amber-300 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <BookMarked className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Aluno frequenta a modalidade 'Reforço' (destaque automático nas Atividades do Momento e Chamada de Frequência)</span>
                  </span>
                </label>
                {(editingStudent.modalidadesEspeciais || editingStudent.specialties || []).includes('Reforço') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 mb-1">
                        Data de Início do Reforço:
                      </label>
                      <input
                        type="date"
                        value={editingStudent.reforcoStartDate || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reforcoStartDate: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-medium bg-white border border-amber-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 mb-1">
                        Data Final do Reforço:
                      </label>
                      <input
                        type="date"
                        value={editingStudent.reforcoEndDate || ''}
                        onChange={(e) => setEditingStudent({ ...editingStudent, reforcoEndDate: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-medium bg-white border border-amber-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Dias de Frequência in Edit Modal */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                    <span>Dias de Frequência e Horários de Saída:</span>
                  </label>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingStudent({
                          ...editingStudent,
                          diasFrequencia: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
                        })
                      }
                      className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200"
                    >
                      Seg a Sex
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingStudent({
                          ...editingStudent,
                          diasFrequencia: ['segunda', 'quarta', 'sexta'],
                        })
                      }
                      className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200"
                    >
                      Seg/Qua/Sex
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingStudent({
                          ...editingStudent,
                          diasFrequencia: ['terca', 'quinta'],
                        })
                      }
                      className="text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200"
                    >
                      Ter/Qui
                    </button>
                  </div>
                </div>

                {/* Quick time fill buttons for Edit Modal */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-indigo-100/60">
                  <span className="text-[10px] font-semibold text-slate-600 flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-indigo-500" />
                    <span>Atalho de Saída (dias marcados):</span>
                  </span>
                  {['17:00', '17:30', '18:00', '18:30', '19:00'].map((presetTime) => (
                    <button
                      key={presetTime}
                      type="button"
                      disabled={isSavingEdit}
                      onClick={() => {
                        const currentDays = editingStudent.diasFrequencia && editingStudent.diasFrequencia.length > 0
                          ? editingStudent.diasFrequencia
                          : (['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as DayOfWeek[]);
                        const updatedHorarios: Partial<Record<DayOfWeek, string>> = {
                          ...(editingStudent.horariosSaida || {}),
                        };
                        currentDays.forEach((day) => {
                          updatedHorarios[day] = presetTime;
                        });
                        setEditingStudent({
                          ...editingStudent,
                          horariosSaida: updatedHorarios,
                        });
                      }}
                      className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shadow-2xs cursor-pointer"
                      title={`Definir saída às ${presetTime} para os dias selecionados`}
                    >
                      {presetTime}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-5 gap-2 pt-1">
                  {[
                    { id: 'segunda' as DayOfWeek, label: 'Segunda', short: 'Seg' },
                    { id: 'terca' as DayOfWeek, label: 'Terça', short: 'Ter' },
                    { id: 'quarta' as DayOfWeek, label: 'Quarta', short: 'Qua' },
                    { id: 'quinta' as DayOfWeek, label: 'Quinta', short: 'Qui' },
                    { id: 'sexta' as DayOfWeek, label: 'Sexta', short: 'Sex' },
                  ].map((d) => {
                    const currentDays = editingStudent.diasFrequencia && editingStudent.diasFrequencia.length > 0
                      ? editingStudent.diasFrequencia
                      : (['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as DayOfWeek[]);
                    const isSelected = currentDays.includes(d.id);

                    return (
                      <div key={d.id} className="flex flex-col space-y-1.5">
                        {/* Day of Week Button */}
                        <button
                          type="button"
                          disabled={isSavingEdit}
                          onClick={() =>
                            setEditingStudent({
                              ...editingStudent,
                              diasFrequencia: toggleDayInList(editingStudent.diasFrequencia, d.id),
                            })
                          }
                          className={`py-1.5 px-1 sm:px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer w-full ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span className="hidden sm:inline">{d.label}</span>
                          <span className="sm:hidden">{d.short}</span>
                        </button>

                        {/* Individual Departure Time Input below day button */}
                        {isSelected ? (
                          <div className="flex flex-col bg-white border border-indigo-200 rounded-xl p-1 shadow-2xs focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                            <span className="text-[9px] font-extrabold uppercase tracking-tight text-indigo-700 text-center block mb-0.5">
                              Saída
                            </span>
                            <input
                              type="time"
                              value={editingStudent.horariosSaida?.[d.id] || ''}
                              disabled={isSavingEdit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditingStudent({
                                  ...editingStudent,
                                  horariosSaida: {
                                    ...(editingStudent.horariosSaida || {}),
                                    [d.id]: val,
                                  },
                                });
                              }}
                              className="w-full text-center text-xs font-bold text-slate-900 bg-transparent outline-none p-0 cursor-pointer"
                              title={`Horário de saída na ${d.label}`}
                            />
                          </div>
                        ) : (
                          <div
                            className="flex flex-col items-center justify-center py-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-100/60 text-slate-400 select-none"
                            title="Não frequenta neste dia"
                          >
                            <span className="text-[9px] font-medium text-slate-400">Folga</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10.5px] text-slate-500 font-medium">
                  💡 O horário de saída individual cadastrado para cada dia será exibido em destaque para a monitora na Lista de Chamada.
                </p>
              </div>
            </div>

            {/* Modal Fixed/Sticky Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 z-10 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenFichaMatriculaPDF(editingStudent)}
                  className="px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl cursor-pointer flex items-center space-x-1.5 transition-all shadow-xs"
                  title="Emitir Ficha Cadastral de Matrícula (PDF)"
                >
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>📄 Ficha de Matrícula (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenTermoSaidaAvulsa(editingStudent)}
                  className="px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl cursor-pointer flex items-center space-x-1.5 transition-all shadow-xs"
                  title="Emitir Termo de Liberação Excepcional / Ficha de Saída de Balcão (PDF)"
                >
                  <Car className="w-4 h-4 text-amber-600" />
                  <span>🚗 Termo de Saída Avulsa</span>
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => {
                    setEditingStudent(null);
                    setOriginalStudentForEdit(null);
                    setEditFormError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5 transition-all"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        {/* Seletor de Exercício Exibido: 2026 | 2027 */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-slate-800 flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Exercício Exibido:</span>
            </span>
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setSelectedAnoLetivo(2026);
                  setOriginFilter('todos');
                }}
                className={`px-3.5 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  selectedAnoLetivo === 2026
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>2026</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    selectedAnoLetivo === 2026 ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count2026}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedAnoLetivo(2027);
                  setOriginFilter('todos');
                }}
                className={`px-3.5 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  selectedAnoLetivo === 2027
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>2027</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    selectedAnoLetivo === 2027 ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count2027}
                </span>
              </button>
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 flex flex-wrap items-center gap-1.5">
            <span>{selectedAnoLetivo === 2026 ? 'Alunos cadastrados no ano letivo de 2026' : `Alunos cadastrados no ano letivo de 2027 (${count2027} oficiais)`}</span>
            {selectedAnoLetivo === 2027 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Base 100% Auditada ({OFFICIAL_2027_BATCH_COUNT} E1)
              </span>
            )}
          </div>
        </div>

        {/* Card Resumo Estatístico de Renovação / Captação (Topo do Exercício 2027) */}
        {selectedAnoLetivo === 2027 && (
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-indigo-900/50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-800/40 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-indigo-300">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                    <span>Painel Estratégico de Renovação & Captação</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                      Exercício 2027
                    </span>
                  </h3>
                  <p className="text-xs text-indigo-200/80">
                    Métricas consolidadas de rematrícula e atração de novos alunos para o ano letivo de 2027
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Tag de Auditoria Oficial: Lote E1 133 Alunos */}
                <div className="flex items-center space-x-1.5 text-xs text-emerald-200 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Base 2027 Auditada:</strong> {count2027} / {OFFICIAL_2027_BATCH_COUNT} Alunos Oficiais (Lote E1)
                  </span>
                </div>

                {/* Tag Pedagógica: 6º Ano Ativo Isento de Perda */}
                <div className="flex items-center space-x-1.5 text-xs text-amber-200 bg-amber-950/60 border border-amber-500/30 px-3 py-1 rounded-xl">
                  <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Formandos do 6º Ano Ativos (2026):</strong> {metrics2027.formandos6AnoCount} alunos excluídos da base de perda
                  </span>
                </div>
              </div>
            </div>

            {/* Grid dos Indicadores Principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Indicador 1: Taxa de Retenção / Rematrícula */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Taxa de Retenção / Rematrícula</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    Base Ativa Elegível 2026
                  </span>
                </div>

                <div className="flex items-baseline space-x-3">
                  <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                    {metrics2027.taxaRetencaoPct.toFixed(1)}%
                  </span>
                  <div className="text-xs text-slate-300">
                    <span className="font-bold text-emerald-400">{metrics2027.rematriculadosCount}</span> alunos rematriculados de{' '}
                    <span className="font-bold text-white">{metrics2027.baseElegivel2026Count}</span> ativos elegíveis
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 bg-black/25 rounded-lg p-2.5 border border-white/10 flex flex-wrap items-center justify-between gap-1.5">
                  <span>Ativos 2026: <strong className="text-white">{metrics2027.totalAtivos2026Count}</strong></span>
                  <span className="text-amber-300">- {metrics2027.formandos6AnoCount} formandos 6º ano ativos</span>
                  <span className="text-emerald-300">= <strong className="text-emerald-400">{metrics2027.baseElegivel2026Count}</strong> base ativa elegível</span>
                </div>
              </div>

              {/* Indicador 2: Composição 2027 (Rematriculados vs Novos) */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                    <span>Composição do Ano Letivo 2027</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-300">
                    Total: {metrics2027.total2027} alunos
                  </span>
                </div>

                {/* Barra Proporcional de Composição */}
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${metrics2027.composicaoRematriculadosPct}%` }}
                      className="bg-emerald-500 transition-all duration-500"
                      title={`Rematriculados: ${metrics2027.composicaoRematriculadosPct.toFixed(1)}% (${metrics2027.rematriculadosCount})`}
                    />
                    <div
                      style={{ width: `${metrics2027.composicaoNovosMiniPct}%` }}
                      className="bg-sky-400 transition-all duration-500"
                      title={`Novos Mini Maternal: ${metrics2027.composicaoNovosMiniPct.toFixed(1)}% (${metrics2027.novosMiniMaternalCount})`}
                    />
                    <div
                      style={{ width: `${metrics2027.composicaoNovosMaternalAo6Pct}%` }}
                      className="bg-purple-500 transition-all duration-500"
                      title={`Novos Maternal ao 6º: ${metrics2027.composicaoNovosMaternalAo6Pct.toFixed(1)}% (${metrics2027.novosMaternalAo6AnoCount})`}
                    />
                  </div>

                  {/* Legenda Resumida */}
                  <div className="flex flex-wrap items-center justify-between text-xs gap-1">
                    <span className="flex items-center gap-1 text-emerald-300 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>{metrics2027.composicaoRematriculadosPct.toFixed(1)}% Rematriculados ({metrics2027.rematriculadosCount})</span>
                    </span>
                    <span className="flex items-center gap-1 text-purple-300 font-bold">
                      <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                      <span>{metrics2027.composicaoNovosPct.toFixed(1)}% Novos Alunos ({metrics2027.novosCount})</span>
                    </span>
                  </div>
                </div>

                {/* Detalhamento de Novos Alunos (Mini Maternal vs Maternal ao 6º) */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-white/5">
                  <div className="bg-sky-950/40 border border-sky-500/20 rounded-lg p-1.5 flex items-center justify-between">
                    <span className="text-sky-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      <span>Mini Maternal (Entrada):</span>
                    </span>
                    <strong className="text-white font-mono">{metrics2027.novosMiniMaternalCount} ({metrics2027.composicaoNovosMiniPct.toFixed(1)}%)</strong>
                  </div>

                  <div className="bg-purple-950/40 border border-purple-500/20 rounded-lg p-1.5 flex items-center justify-between">
                    <span className="text-purple-300 flex items-center gap-1">
                      <UserPlus className="w-3 h-3 text-purple-400" />
                      <span>Maternal ao 6º Ano:</span>
                    </span>
                    <strong className="text-white font-mono">{metrics2027.novosMaternalAo6AnoCount} ({metrics2027.composicaoNovosMaternalAo6Pct.toFixed(1)}%)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pílulas de Filtro Rápido de Origem no Ano Letivo de 2027 */}
        {selectedAnoLetivo === 2027 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5 text-indigo-600" />
                <span>Origem do Aluno:</span>
              </span>
              <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-xl border border-slate-200 gap-1">
                <button
                  type="button"
                  onClick={() => setOriginFilter('todos')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                    originFilter === 'todos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Todos ({metrics2027.total2027})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOriginFilter('rematriculados')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                    originFilter === 'rematriculados'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Alunos ativos em 2027 que possuem histórico cadastral em 2026"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rematriculados ({metrics2027.rematriculadosCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOriginFilter('novos')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                    originFilter === 'novos'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Alunos ativos em 2027 sem histórico em 2026"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Novos Alunos ({metrics2027.novosCount})</span>
                </button>

                {/* Detalhamento separando Mini Maternal dos demais anos */}
                <div className="flex items-center gap-1 pl-1 border-l border-slate-300/80">
                  <button
                    type="button"
                    onClick={() => setOriginFilter('novos_mini')}
                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center space-x-1 ${
                      originFilter === 'novos_mini'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200'
                    }`}
                    title="Alunos novos na turma de entrada (Mini Maternal 100% nova)"
                  >
                    <Sparkles className="w-3 h-3 text-sky-500" />
                    <span>Mini Maternal ({metrics2027.novosMiniMaternalCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOriginFilter('novos_outros')}
                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center space-x-1 ${
                      originFilter === 'novos_outros'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200'
                    }`}
                    title="Alunos novos captados do Maternal ao 6º Ano"
                  >
                    <span>Maternal ao 6º Ano ({metrics2027.novosMaternalAo6AnoCount})</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[11px] font-medium text-slate-500">
              {originFilter === 'todos' && `Exibindo base total de 2027 (${metrics2027.total2027} alunos)`}
              {originFilter === 'rematriculados' && `Exibindo ${metrics2027.rematriculadosCount} alunos rematriculados de 2026`}
              {originFilter === 'novos' && `Exibindo ${metrics2027.novosCount} novos alunos captados em 2027`}
              {originFilter === 'novos_mini' && `Exibindo ${metrics2027.novosMiniMaternalCount} alunos novos do Mini Maternal (turma de entrada)`}
              {originFilter === 'novos_outros' && `Exibindo ${metrics2027.novosMaternalAo6AnoCount} alunos novos captados do Maternal ao 6º Ano`}
            </div>
          </div>
        )}

        {/* Banner informativo de duplicidades quando detectadas */}
        {duplicateInfoCurrentYear.totalDuplicatesCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 animate-in fade-in">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Detectados <strong>{duplicateInfoCurrentYear.totalDuplicatesCount} cadastros duplicados</strong> no Ano Letivo <strong>{selectedAnoLetivo}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleOpenSanitizeModal(selectedAnoLetivo)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Sanitizar {duplicateInfoCurrentYear.totalDuplicatesCount} Duplicados</span>
            </button>
          </div>
        )}

        {selectedAnoLetivo === 2026 && duplicateInfo2027.totalDuplicatesCount > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Existem <strong>{duplicateInfo2027.totalDuplicatesCount} duplicatas</strong> detectadas no exercício futuro de <strong>2027</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedAnoLetivo(2027);
                handleOpenSanitizeModal(2027);
              }}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
            >
              <span>Ver e Sanitizar 2027</span>
            </button>
          </div>
        )}

        {/* Status Filter Toggle Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-700">Situação:</span>
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setStatusFilter('ativos')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  statusFilter === 'ativos'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Apenas Ativos ({totalAtivosCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('inativos')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  statusFilter === 'inativos'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Inativos / Cancelados ({totalInativosCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  statusFilter === 'todos'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Todos ({studentsForSelectedYear.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => {
                if (selectedTurma !== 'TODAS') {
                  setNominalFilterTurma(selectedTurma);
                }
                if (selectedActivity !== 'TODAS' && selectedActivity !== 'TODOS') {
                  setNominalFilterSpecialty(selectedActivity);
                }
                setShowNominalListModal(true);
              }}
              className="px-3 py-1 text-xs font-bold rounded-lg text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
              title="Abrir relação nominal cadastral com os filtros atuais"
            >
              <BookMarked className="w-3.5 h-3.5 text-emerald-600" />
              <span>Relação Nominal Cadastral</span>
            </button>

            <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
              {statusFilter === 'ativos' && 'Exibindo apenas alunos com frequência regular ativa'}
              {statusFilter === 'inativos' && 'Exibindo alunos inativos e desligados (ocultos na chamada diária)'}
              {statusFilter === 'todos' && 'Exibindo base total de alunos matriculados e históricos'}
            </div>
          </div>
        </div>

        {/* Barra de Seleção de Turmas com Rolagem Horizontal Fluida (Educação Infantil ao 6º Ano) */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Turmas ({turmasList.length}):</span>
              <span className="text-[11px] font-normal text-slate-400 lowercase hidden sm:inline">(Educação Infantil ao 6º Ano)</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollTurmasBar('left')}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                title="Rolar turmas para a esquerda"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollTurmasBar('right')}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                title="Rolar turmas para a direita"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={turmasScrollRef}
            className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 pt-0.5 no-scrollbar overscroll-x-contain scroll-smooth w-full"
          >
            {(isCoordenador || turmasList.length > 1) && (
              <button
                type="button"
                onClick={() => setSelectedTurma('TODAS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center space-x-2 border ${
                  selectedTurma === 'TODAS'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span>Todas as Turmas</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    selectedTurma === 'TODAS' ? 'bg-indigo-800 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {totalAtivosCount}
                </span>
              </button>
            )}

            {turmasList.map((t, tIdx) => {
              const isSelected = selectedTurma === t;
              const count = studentsForSelectedYear.filter(
                (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && s.turma === t
              ).length;
              return (
                <button
                  key={`${t}-${tIdx}`}
                  type="button"
                  onClick={() => setSelectedTurma(t)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/20'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span>{t}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-indigo-800 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Filtrar por Turma:
            </label>
            <select
              value={selectedTurma}
              onChange={(e) => setSelectedTurma(e.target.value as TurmaType | 'TODAS')}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-medium"
            >
              {(isCoordenador || turmasList.length > 1) && (
                <option value="TODAS">
                  {isCoordenador
                    ? `Todas as Turmas (${totalAtivosCount} Alunos Ativos)`
                    : `Todas Minhas Turmas (${studentsForSelectedYear.filter((s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && allowedTurmas.includes(s.turma)).length} Alunos Ativos)`}
                </option>
              )}
              {turmasList.map((t, tIdx) => {
                const count = studentsForSelectedYear.filter(
                  (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && s.turma === t
                ).length;
                return (
                  <option key={`${t}-${tIdx}`} value={t}>
                    {t} ({count} {count === 1 ? 'aluno' : 'alunos'})
                  </option>
                );
              })}
            </select>
            {selectedTurma !== 'TODAS' && (
              <button
                onClick={() => {
                  setTurmaToDelete(selectedTurma);
                  const remaining = turmasList.filter((t) => t !== selectedTurma);
                  if (remaining.length > 0) setReassignTargetTurma(remaining[0]);
                }}
                className="mt-1.5 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition-all cursor-pointer inline-flex items-center space-x-1"
                title={`Excluir a turma ${selectedTurma}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Excluir Turma "{selectedTurma}"</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Filtrar por Atividade:
            </label>
            <select
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value as ActivityType | 'TODAS')}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-medium"
            >
              <option value="TODAS">Todas as Atividades ({totalAtivosCount} alunos)</option>
              {extracurricularRollCallActivities.map((a) => {
                const count = studentsForSelectedYear.filter(
                  (s) =>
                    (s.status || s.statusMatricula || 'ativo') === 'ativo' &&
                    ((s.activities || []).includes(a.id) ||
                      (a.id === 'Reforço' && (s.modalidadesEspeciais || []).includes('Reforço')))
                ).length;
                return (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id} ({count} {count === 1 ? 'aluno' : 'alunos'})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Buscar Aluno:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="input-search-students"
                type="text"
                placeholder="Digite o nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm md:text-base">
              Relação de Alunos Cadastrados
            </h3>
          </div>
          <span className="text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-1 rounded-full">
            {filteredStudents.length} de {studentsForSelectedYear.length} alunos (Exercício {selectedAnoLetivo})
          </span>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">Nenhum aluno encontrado para estes filtros.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredStudents.map((student) => {
              const stStatus = student.status || 'ativo';
              const isInactive = stStatus === 'inativo';
              const isCancelled = stStatus === 'cancelado';

              return (
                <div
                  key={student.id}
                  className={`p-4 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isCancelled
                      ? 'bg-rose-50/40 hover:bg-rose-50/70'
                      : isInactive
                      ? 'bg-slate-50/60 hover:bg-slate-100/70'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`font-bold text-sm md:text-base ${isCancelled ? 'text-slate-600 line-through' : 'text-slate-900'}`}>
                        {student.name}
                      </span>
                      <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        {student.turma}
                      </span>
                      {student.matricula && !student.matricula.startsWith('st-') && (
                        <span
                          className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded"
                          title={`Código de Matrícula / RA: ${student.matricula}`}
                        >
                          RA: {student.matricula}
                        </span>
                      )}

                      {/* Badge de Origem 2027: Rematriculado vs Novo Aluno */}
                      {selectedAnoLetivo === 2027 && (
                        isStudentRematriculadoFrom2026(student) ? (
                          <span
                            className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                            title="Rematriculado: aluno com histórico cadastral confirmado em 2026"
                          >
                            <RotateCcw className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Rematriculado</span>
                          </span>
                        ) : isTurmaMiniMaternal(student.turma) ? (
                          <span
                            className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                            title="Novo Aluno: ingresso na turma de entrada (Mini Maternal 100% nova)"
                          >
                            <Sparkles className="w-3 h-3 text-sky-600 shrink-0" />
                            <span>Novo • Mini Maternal</span>
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                            title="Novo Aluno: captação de vaga para turmas do Maternal ao 6º Ano"
                          >
                            <UserPlus className="w-3 h-3 text-purple-600 shrink-0" />
                            <span>Novo Aluno</span>
                          </span>
                        )
                      )}

                      {/* Contract Type Badge */}
                      {student.tipoContrato === 'avulso' ? (
                        <span
                          className="text-[10.5px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                          title={`Contrato Avulso / Temporário: ${student.dataInicioContrato ? formatDateBR(student.dataInicioContrato) : ''} até ${student.dataTerminoContrato ? formatDateBR(student.dataTerminoContrato) : ''}`}
                        >
                          <Calendar className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>
                            Avulso ({student.dataInicioContrato ? formatDateBR(student.dataInicioContrato) : ''} a {student.dataTerminoContrato ? formatDateBR(student.dataTerminoContrato) : ''})
                          </span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          Regular
                        </span>
                      )}

                      {/* Modalidade Paralela Reforço Badge */}
                      {(student.modalidadesEspeciais || student.specialties || []).includes('Reforço') && (
                        <span
                          className="text-[10.5px] font-black text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                          title="Aluno matriculado na modalidade paralela de Reforço Escolar"
                        >
                          <BookMarked className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Reforço Escolar</span>
                          {(student.reforcoStartDate || student.reforcoEndDate) && (
                            <span className="text-[9.5px] font-semibold text-amber-800 ml-1">
                              ({student.reforcoStartDate ? formatDateBR(student.reforcoStartDate) : '...'} a {student.reforcoEndDate ? formatDateBR(student.reforcoEndDate) : '...'})
                            </span>
                          )}
                        </span>
                      )}
                      
                      {/* Status Badges */}
                      {stStatus === 'ativo' && (
                        <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center space-x-1">
                          <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>Ativo</span>
                        </span>
                      )}
                      {isInactive && (
                        <span className="text-[10.5px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md flex items-center space-x-1" title={student.inactivationReason ? `Motivo: ${student.inactivationReason}` : undefined}>
                          <UserX className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>Inativo {student.inactivationDate ? `(desde ${formatDateBR(student.inactivationDate)})` : ''}</span>
                        </span>
                      )}
                      {isCancelled && (
                        <span className="text-[10.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md flex items-center space-x-1" title={student.inactivationReason ? `Motivo: ${student.inactivationReason}` : undefined}>
                          <UserX className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>Cancelado {student.inactivationDate ? `(desde ${formatDateBR(student.inactivationDate)})` : ''}</span>
                        </span>
                      )}

                      <span
                        className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md border flex items-center space-x-1 ${
                          student.diasFrequencia && student.diasFrequencia.length < 5
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title={`Dias de Frequência: ${formatDiasFrequencia(student.diasFrequencia)}`}
                      >
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        <span>{formatDiasFrequencia(student.diasFrequencia)}</span>
                      </span>

                      {/* Departure Times Badges */}
                      {student.horariosSaida && Object.keys(student.horariosSaida).length > 0 && (() => {
                        const entries = (['segunda', 'terca', 'quarta', 'quinta', 'sexta'] as DayOfWeek[])
                          .filter((d) => student.horariosSaida?.[d])
                          .map((d) => ({ day: d, time: student.horariosSaida![d]! }));
                        if (entries.length === 0) return null;
                        const uniqueTimes = Array.from(new Set(entries.map((e) => e.time)));
                        return (
                          <span
                            className="text-[10.5px] font-bold px-2 py-0.5 rounded-md border flex items-center space-x-1 bg-indigo-50 text-indigo-800 border-indigo-200 shadow-2xs"
                            title={entries.map((e) => `${e.day}: ${formatHorarioSaida(e.time)}`).join(' | ')}
                          >
                            <Clock className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span>
                              {uniqueTimes.length === 1
                                ? `Saída às ${formatHorarioSaida(uniqueTimes[0])}`
                                : `Saídas: ${entries.map((e) => `${e.day.slice(0, 3)} ${formatHorarioSaida(e.time)}`).join(', ')}`}
                            </span>
                          </span>
                        );
                      })()}

                      {/* Selo/Chip de Logística de Deslocamento / Saída */}
                      {student.tipoSaida === 'TRANSPORTE_ESCOLAR' ? (
                        <span
                          className="text-[10.5px] font-black text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                          title={`Transporte Escolar: Condutor(a) ${student.nomeCondutor || 'Van'}`}
                        >
                          <span>🚌 Transp: {student.nomeCondutor || 'Escolar'}</span>
                        </span>
                      ) : (
                        <span
                          className="text-[10.5px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center space-x-1"
                          title="Saída acompanhada pelos pais ou responsáveis"
                        >
                          <span>🚗 Pais</span>
                        </span>
                      )}

                      {/* Selo/Chip do Plano Contratual e Mensalidade Final */}
                      {(() => {
                        const studentYear = student.anoLetivo || selectedAnoLetivo;
                        const tabela = getTabelaPlanosPorAno(studentYear);
                        const plano = student.planoContratual || 'Integral Semana (18:30h)';
                        const defaultBase = tabela[plano]?.valorBase || (studentYear === 2027 ? 1250 : 1120);
                        const horario = student.horarioPermanenciaLimite || tabela[plano]?.horarioPadrao || '18:30h';
                        const valorFinal =
                          student.valorMensalidadeFinal !== undefined
                            ? student.valorMensalidadeFinal
                            : student.valorPlanoBase !== undefined
                            ? Math.max(0, student.valorPlanoBase - (student.descontoBolsa || 0))
                            : defaultBase;
                        return (
                          <span
                            className="text-[10.5px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-2xs"
                            title={`Plano: ${plano} (${studentYear}) | Horário: ${horario} | Mensalidade: ${formatCurrencyBR(valorFinal)}`}
                          >
                            <BadgeDollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{plano}: <strong>{formatCurrencyBR(valorFinal)}</strong></span>
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {student.activities.map((act) => {
                        const actMeta = activityMap.get(act);
                        return (
                          <ActivityBadge
                            key={act}
                            activity={act}
                            iconName={actMeta?.icon}
                            customIconUrl={actMeta?.customIconUrl}
                            customEquipment={actMeta?.defaultEquipment}
                            size="sm"
                          />
                        );
                      })}
                      {student.inactivationReason && (
                        <span className="text-[11px] text-slate-500 italic bg-white px-2 py-0.5 rounded border border-slate-200">
                          Motivo: {student.inactivationReason}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 self-end md:self-center">
                    {(isInactive || isCancelled) && userCanManageStudents && (
                      <button
                        onClick={() => handleQuickReactivate(student)}
                        className="p-2 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-bold"
                        title="Reativar matrícula do aluno no sistema"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Reativar Aluno</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const result = generateStudentPDFReport(student, currentWeek, records);
                        setPdfPreviewState({
                          isOpen: true,
                          doc: result.doc,
                          dataUrl: result.dataUrl || result.dataUri,
                          blobUrl: result.blobUrl,
                          filename: result.filename,
                          title: `Ficha Individual - ${student.name}`,
                          onDownload: result.download,
                        });
                      }}
                      className="p-2 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-semibold"
                      title="Visualizar e baixar relatório de frequência em PDF deste aluno"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">Relatório PDF</span>
                    </button>

                    <button
                      onClick={() => handleOpenFichaMatriculaPDF(student)}
                      className="p-2 rounded-lg text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-semibold"
                      title="Emitir Ficha Cadastral de Matrícula (PDF)"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>📄 Ficha de Matrícula (PDF)</span>
                    </button>

                    <button
                      onClick={() => handleOpenTermoSaidaAvulsa(student)}
                      className="p-2 rounded-lg text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-all cursor-pointer flex items-center space-x-1 text-xs font-bold shadow-2xs"
                      title="Emitir Termo de Liberação Excepcional / Ficha de Saída de Balcão (PDF)"
                    >
                      <Car className="w-3.5 h-3.5 text-amber-600" />
                      <span>🚗 Termo de Saída Avulsa</span>
                    </button>

                    {userCanManageStudents && (
                      <>
                        <button
                          onClick={() => handleOpenTransfer(student)}
                          className="p-2 rounded-lg text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-semibold"
                          title="Mudar aluno para outra turma (preserva todo o histórico)"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-600" />
                          <span>Mudar Turma</span>
                        </button>

                        <button
                          onClick={() => handleOpenEdit(student)}
                          className="p-2 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-semibold"
                          title="Editar aluno e atividades"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>

                        <button
                          onClick={() => handleOpenDelete(student)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer"
                          title="Excluir aluno"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {/* Transfer Student Modal */}
      {transferringStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5 text-amber-700">
                <div className="p-2.5 bg-amber-100 rounded-xl">
                  <ArrowRightLeft className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Mudar Turma do Aluno</h3>
                  <p className="text-xs text-slate-500">Transferência com preservação integral do histórico</p>
                </div>
              </div>
              <button
                onClick={() => setTransferringStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmTransfer} className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Aluno:</p>
                <p className="font-bold text-slate-900 text-base">{transferringStudent.name}</p>
                <div className="flex items-center space-x-2 text-xs text-slate-600 pt-1">
                  <span>Turma Atual:</span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                    {transferringStudent.turma}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Selecione a Nova Turma:
                </label>
                <select
                  value={targetTransferTurma}
                  onChange={(e) => setTargetTransferTurma(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                  {turmasList.map((t, tIdx) => (
                    <option key={`${t}-${tIdx}`} value={t} disabled={t === transferringStudent.turma}>
                      {t} {t === transferringStudent.turma ? '(Turma Atual)' : ''}
                    </option>
                  ))}
                </select>
                {!isCoordenador && allowedTurmas.filter((t) => t !== transferringStudent.turma).length === 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 font-semibold mt-2">
                    ⚠️ Você possui apenas uma turma vinculada ao seu perfil ({transferringStudent.turma}). Não há outras turmas liberadas para você realizar transferências.
                  </p>
                )}
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Preservação Automática de Histórico:</span>
                </div>
                <p className="text-emerald-800 leading-relaxed pl-5.5">
                  Ao trocar a turma, todas as chamadas e lançamentos passados do aluno são <strong>mantidos integralmente</strong> no histórico individual dele e nos relatórios anteriores.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingTransfer}
                  onClick={() => setTransferringStudent(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTransfer || !targetTransferTurma || targetTransferTurma === transferringStudent.turma}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5 transition-all"
                >
                  {isSavingTransfer ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transferindo...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Confirmar Troca de Turma</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Excluir Aluno</h3>
                <p className="text-xs text-slate-500">Esta ação removerá o aluno da lista de matrículas.</p>
              </div>
            </div>

            <div className="text-sm text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
              <p>
                Tem certeza que deseja excluir o aluno:
              </p>
              <p className="font-bold text-slate-900 text-base">
                {studentToDelete.name}
              </p>
              <p className="text-xs text-indigo-700 font-semibold bg-indigo-50 inline-block px-2 py-0.5 rounded border border-indigo-100">
                Turma: {studentToDelete.turma}
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingStudent}
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-delete-student"
                disabled={isDeletingStudent}
                onClick={handleConfirmDeleteStudent}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                {isDeletingStudent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeletingStudent ? 'Excluindo no Firestore...' : 'Sim, Excluir Aluno'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Turma Confirmation Modal */}
      {turmaToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Excluir Turma</h3>
                <p className="text-xs text-slate-500">Confirmação de remoção de turma</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
              <div className="text-xs text-rose-900 font-medium">
                Você está prestes a excluir a turma: <strong className="text-sm font-bold block text-rose-950 mt-0.5">{turmaToDelete}</strong>
              </div>

              {(() => {
                const studentsInTurmaCount = students.filter((s) => s.turma === turmaToDelete).length;
                const otherTurmas = turmasList.filter((t) => t !== turmaToDelete);

                if (studentsInTurmaCount === 0) {
                  return (
                    <p className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 font-medium">
                      ✓ Esta turma não possui nenhum aluno cadastrado. A remoção será feita imediatamente.
                    </p>
                  );
                }

                return (
                  <div className="space-y-3 pt-1">
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-semibold">
                      ⚠️ Esta turma possui <span className="font-bold text-amber-950 underline">{studentsInTurmaCount} aluno(s)</span> cadastrado(s).
                    </div>

                    <div className="space-y-2 text-xs text-slate-800">
                      <span className="font-bold block text-slate-900">O que deseja fazer com os alunos desta turma?</span>
                      
                      <label className="flex items-start space-x-2 p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                        <input
                          type="radio"
                          name="deleteStudentMode"
                          checked={deleteStudentsWithTurma}
                          onChange={() => setDeleteStudentsWithTurma(true)}
                          className="mt-0.5 text-rose-600 focus:ring-rose-500"
                        />
                        <div>
                          <span className="font-bold text-rose-700 block">Excluir a turma e REMOVER todos os {studentsInTurmaCount} alunos</span>
                          <span className="text-[11px] text-slate-500">Os alunos e seus históricos de chamada serão apagados.</span>
                        </div>
                      </label>

                      {otherTurmas.length > 0 && (
                        <label className="flex items-start space-x-2 p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                          <input
                            type="radio"
                            name="deleteStudentMode"
                            checked={!deleteStudentsWithTurma}
                            onChange={() => setDeleteStudentsWithTurma(false)}
                            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="w-full">
                            <span className="font-bold text-indigo-900 block">Excluir a turma e MOVER os {studentsInTurmaCount} alunos para outra turma</span>
                            {!deleteStudentsWithTurma && (
                              <select
                                value={reassignTargetTurma || otherTurmas[0]}
                                onChange={(e) => setReassignTargetTurma(e.target.value)}
                                className="mt-1.5 w-full p-1.5 text-xs border border-indigo-200 rounded-lg bg-indigo-50 text-indigo-950 font-bold"
                              >
                                {otherTurmas.map((ot) => (
                                  <option key={ot} value={ot}>
                                    {ot}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTurmaToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTurma && turmaToDelete) {
                    const count = students.filter((s) => s.turma === turmaToDelete).length;
                    const hasOtherTurmas = turmasList.filter((t) => t !== turmaToDelete).length > 0;
                    const shouldDeleteStudents = count === 0 || deleteStudentsWithTurma || !hasOtherTurmas;
                    const targetReassign = !shouldDeleteStudents ? (reassignTargetTurma || turmasList.filter((t) => t !== turmaToDelete)[0]) : undefined;
                    
                    onDeleteTurma(turmaToDelete, shouldDeleteStudents, targetReassign, selectedAnoLetivo);
                    if (selectedTurma === turmaToDelete) {
                      setSelectedTurma('TODAS');
                    }
                  }
                  setTurmaToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirmar Exclusão da Turma</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Turmas Modal */}
      {showManageTurmasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5 text-slate-900">
                <div className="p-2.5 bg-indigo-100 rounded-xl text-indigo-700">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Gerenciar Turmas</h3>
                  <p className="text-xs text-slate-500">Adicione novas turmas ou exclua turmas existentes</p>
                </div>
              </div>
              <button
                onClick={() => setShowManageTurmasModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form to add custom Turma */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCustomTurmaError(null);
                if (!newCustomTurmaInput.trim()) {
                  setCustomTurmaError('Digite o nome da turma.');
                  return;
                }
                if (onAddTurma) {
                  const added = onAddTurma(newCustomTurmaInput.trim());
                  if (!added) {
                    setCustomTurmaError('Esta turma já existe na lista.');
                    return;
                  }
                }
                setNewCustomTurmaInput('');
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2"
            >
              <label className="block text-xs font-bold text-slate-800">
                + Criar Nova Turma:
              </label>
              {customTurmaError && (
                <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200">
                  ⚠️ {customTurmaError}
                </div>
              )}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Ex: 7º Ano Azul ou Jardim 2"
                  value={newCustomTurmaInput}
                  onChange={(e) => setNewCustomTurmaInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar</span>
                </button>
              </div>
            </form>

            {/* List of existing turmas */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-xs font-bold text-slate-700 block">Turmas Cadastradas ({turmasList.length}):</span>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {turmasList.map((tName) => {
                  const studentCount = students.filter((s) => s.turma === tName).length;
                  return (
                    <div key={tName} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block">{tName}</span>
                        <span className="text-[11px] text-slate-500 font-medium">{studentCount} aluno(s) matriculado(s)</span>
                      </div>
                      <button
                        onClick={() => {
                          setShowManageTurmasModal(false);
                          setTurmaToDelete(tName);
                          const remaining = turmasList.filter((t) => t !== tName);
                          if (remaining.length > 0) setReassignTargetTurma(remaining[0]);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-all cursor-pointer flex items-center space-x-1"
                        title="Excluir esta turma"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowManageTurmasModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Relações Nominais de Alunos (Presença e Faltas - Regulares e Avulsos) */}
      <RosterReportModal
        isOpen={showNominalListModal}
        onClose={() => setShowNominalListModal(false)}
        students={studentsForSelectedYear || []}
        records={records || []}
        anoLetivo={selectedAnoLetivo}
        turmasList={turmasList}
        extracurricularRollCallActivities={extracurricularRollCallActivities}
        currentUser={currentUser}
        defaultTurma={nominalFilterTurma}
        defaultSpecialty={nominalFilterSpecialty}
        defaultDay={nominalFilterDay}
      />

      {/* On-screen PDF Viewer Modal para Ficha Individual */}
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

      {/* Modal de Emissão do Termo de Liberação Excepcional / Saída Avulsa */}
      {saidaAvulsaModalOpen && studentForSaidaAvulsa && (
        <SaidaAvulsaModal
          isOpen={saidaAvulsaModalOpen}
          onClose={() => {
            setSaidaAvulsaModalOpen(false);
            setStudentForSaidaAvulsa(null);
          }}
          student={studentForSaidaAvulsa}
          currentUser={currentUser}
        />
      )}

      {/* Modal de Sanitização / Remoção de Cadastros Duplicados */}
      {showSanitizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Eraser className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Sanitizar / Remover Cadastros Duplicados
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ano Letivo: <strong>{sanitizeTargetYear}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSanitizeModal(false)}
                disabled={isSanitizing}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alternador de Ano para Sanitização */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-bold text-slate-600">Exercício a analisar:</span>
              <button
                type="button"
                onClick={() => setSanitizeTargetYear(2026)}
                className={`px-3 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                  sanitizeTargetYear === 2026
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                2026 ({findDuplicateStudentGroups(students || [], 2026).totalDuplicatesCount} duplicatas)
              </button>
              <button
                type="button"
                onClick={() => setSanitizeTargetYear(2027)}
                className={`px-3 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                  sanitizeTargetYear === 2027
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                2027 ({findDuplicateStudentGroups(students || [], 2027).totalDuplicatesCount} duplicatas)
              </button>
            </div>

            {(() => {
              const info = findDuplicateStudentGroups(students || [], sanitizeTargetYear);
              return (
                <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                  {info.totalDuplicatesCount === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center text-xs text-emerald-800 space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <p className="font-bold text-sm">Nenhum cadastro duplicado detectado!</p>
                      <p className="text-emerald-700">
                        Todos os alunos do Ano Letivo {sanitizeTargetYear} possuem identidades únicas e registros consistentes.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <span className="text-[10px] uppercase font-bold text-amber-700 block tracking-wider">
                            Duplicatas a Excluir
                          </span>
                          <span className="text-2xl font-black text-amber-900">
                            {info.totalDuplicatesCount}
                          </span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">
                            Alunos Canônicos Mantidos
                          </span>
                          <span className="text-2xl font-black text-emerald-900">
                            {info.groups.length}
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                        <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                          <ShieldAlert className="w-4 h-4 text-indigo-600" />
                          <span>Garantia de Integridade e Históricos:</span>
                        </div>
                        <p>
                          A rotina manterá <strong>exatamente 1 registro canônico por aluno</strong> (preservando o ID original com dados financeiros e contratuais), excluindo do Firestore apenas os IDs redundantes gerados por importações anteriores.
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Nenhum histórico de chamada ou frequência será perdido.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 block">
                          Demonstrativo dos Alunos Agrupados ({info.groups.length} grupos):
                        </span>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {info.groups.map((grp) => (
                            <div
                              key={grp.key}
                              className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-2 shadow-xs"
                            >
                              <div className="flex items-center justify-between font-bold text-slate-900">
                                <span>{grp.canonical.name}</span>
                                <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                                  {grp.canonical.turma}
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 text-emerald-900 font-medium">
                                  <span className="flex items-center space-x-1">
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Manter: ID <code>{grp.canonical.id}</code></span>
                                  </span>
                                  <span className="text-[10px] font-bold uppercase bg-emerald-200/80 text-emerald-800 px-1.5 py-0.2 rounded">
                                    Canônico
                                  </span>
                                </div>
                                {grp.duplicates.map((dup) => (
                                  <div
                                    key={dup.id}
                                    className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 text-rose-900 font-medium"
                                  >
                                    <span className="flex items-center space-x-1">
                                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                      <span>Remover: ID <code>{dup.id}</code></span>
                                    </span>
                                    <span className="text-[10px] font-bold uppercase bg-rose-200/80 text-rose-800 px-1.5 py-0.2 rounded">
                                      Duplicata
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSanitizeModal(false)}
                disabled={isSanitizing}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              {findDuplicateStudentGroups(students || [], sanitizeTargetYear).totalDuplicatesCount > 0 && (
                <button
                  type="button"
                  onClick={handleExecuteSanitize}
                  disabled={isSanitizing}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl cursor-pointer shadow-md shadow-amber-600/20 transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isSanitizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Excluindo Duplicatas no Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Eraser className="w-4 h-4" />
                      <span>
                        Confirmar e Remover {findDuplicateStudentGroups(students || [], sanitizeTargetYear).totalDuplicatesCount} Duplicatas
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
