import React, { useState } from 'react';
import { Student, ActivityType, TurmaType, AttendanceRecord, WeekInfo, UserProfile, ActivityItem, DayOfWeek, StudentStatus } from '../types';
import { TURMAS_LIST, ACTIVITIES_LIST, OFFICIAL_ROLL_CALL_MODALITIES } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { generateStudentPDFReport, generateTurmaPDFReport } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { canManageStudents, canManageTurmas } from '../utils/authUtils';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { formatDiasFrequencia, ALL_DAYS_OF_WEEK, toISODateString, formatDateBR, formatHorarioSaida } from '../utils/dateUtils';
import { Users, UserPlus, FileText, Trash2, Edit3, Check, X, Search, Sparkles, Download, Layers, Plus, Info, ArrowRightLeft, CheckCircle2, ShieldAlert, Loader2, Calendar, CalendarDays, CheckSquare, UserX, UserCheck, Power, AlertCircle, RotateCcw, Clock } from 'lucide-react';

interface StudentManagerProps {
  students: Student[];
  records?: AttendanceRecord[];
  turmas?: string[];
  activitiesList?: ActivityItem[];
  currentWeek?: WeekInfo;
  currentUser?: UserProfile | null;
  onAddStudent: (student: Omit<Student, 'id'>) => void | Promise<void>;
  onBatchAddStudents: (names: string[], turma: TurmaType, activities: ActivityType[], diasFrequencia?: DayOfWeek[]) => void | Promise<void>;
  onUpdateStudent: (student: Student) => void | Promise<void>;
  onDeleteStudent: (id: string) => void | Promise<void>;
  onAddTurma?: (turmaName: string) => boolean;
  onDeleteTurma?: (turmaName: string, deleteStudents: boolean, targetTurmaToReassign?: string) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students,
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
}) => {
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

  // Single Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTurma, setNewTurma] = useState<TurmaType>(turmasList[0] || '1º Ano Azul');
  const [newActivities, setNewActivities] = useState<ActivityType[]>(['Rotina', 'Natação', 'Flauta']);
  const [newDiasFrequencia, setNewDiasFrequencia] = useState<DayOfWeek[]>(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
  const [newHorariosSaida, setNewHorariosSaida] = useState<Partial<Record<DayOfWeek, string>>>({});
  const [isSavingSingle, setIsSavingSingle] = useState(false);

  // Batch Add state
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchNamesText, setBatchNamesText] = useState('');
  const [batchTurma, setBatchTurma] = useState<TurmaType>(turmasList[0] || '1º Ano Azul');
  const [batchActivities, setBatchActivities] = useState<ActivityType[]>(['Rotina', 'Natação']);
  const [batchDiasFrequencia, setBatchDiasFrequencia] = useState<DayOfWeek[]>(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

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
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [targetTransferTurma, setTargetTransferTurma] = useState<string>('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  // On-screen PDF Viewer State
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

  const handleOpenEdit = (student: Student) => {
    if (!isCoordenador && currentUser && !allowedTurmas.includes(student.turma)) {
      return;
    }
    setEditFormError(null);
    setEditingStudent({
      ...student,
      diasFrequencia:
        student.diasFrequencia && student.diasFrequencia.length > 0
          ? student.diasFrequencia
          : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      horariosSaida: student.horariosSaida ? { ...student.horariosSaida } : {},
    });
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

  const totalAtivosCount = React.useMemo(
    () => students.filter((s) => (s.status || 'ativo') === 'ativo').length,
    [students]
  );
  const totalInativosCount = React.useMemo(
    () => students.filter((s) => s.status === 'inativo' || s.status === 'cancelado').length,
    [students]
  );

  const filteredStudents = React.useMemo(() => {
    return (students || [])
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

        const studentActs = Array.isArray(student.activities) ? student.activities : [];
        const matchesTurma = selectedTurma === 'TODAS' || student.turma === selectedTurma;
        const matchesActivity =
          selectedActivity === 'TODAS' || studentActs.includes(selectedActivity);
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
  }, [students, selectedTurma, selectedActivity, searchTerm, statusFilter, isCoordenador, currentUser, allowedTurmas]);

  const handleQuickReactivate = async (student: Student) => {
    try {
      const updated: Student = {
        ...student,
        status: 'ativo',
        inactivationDate: undefined,
        inactivationReason: undefined,
      };
      await Promise.resolve(onUpdateStudent(updated));
    } catch (err: any) {
      console.error('Error reactivating student:', err);
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
    setIsSavingSingle(true);
    try {
      const finalActivities = newActivities.includes('Rotina')
        ? Array.from(new Set(newActivities))
        : ['Rotina', ...Array.from(new Set(newActivities))];
      await Promise.resolve(
        onAddStudent({
          name: trimmedName,
          turma: newTurma,
          activities: finalActivities,
          diasFrequencia: newDiasFrequencia,
          horariosSaida: newHorariosSaida,
          status: 'ativo',
        })
      );
      setNewName('');
      setNewDiasFrequencia(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
      setNewHorariosSaida({});
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
    const names = batchNamesText
      .split('\n')
      .map((n) => n.trim())
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

      await Promise.resolve(
        onBatchAddStudents(names, batchTurma, finalActivities, batchDiasFrequencia)
      );
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

    setIsSavingEdit(true);
    try {
      const currentActs = Array.isArray(editingStudent.activities) ? editingStudent.activities : [];
      const finalActivities = currentActs.includes('Rotina')
        ? Array.from(new Set(currentActs))
        : ['Rotina', ...Array.from(new Set(currentActs))];

      const newStatus = editingStudent.status || 'ativo';
      const studentToSave: Student = {
        ...editingStudent,
        name: trimmedName,
        turma: editingStudent.turma,
        activities: finalActivities,
        status: newStatus,
        inactivationDate:
          newStatus === 'inativo' || newStatus === 'cancelado'
            ? editingStudent.inactivationDate || toISODateString(new Date())
            : undefined,
        inactivationReason:
          newStatus === 'inativo' || newStatus === 'cancelado'
            ? editingStudent.inactivationReason
            : undefined,
        diasFrequencia:
          editingStudent.diasFrequencia && editingStudent.diasFrequencia.length > 0
            ? editingStudent.diasFrequencia
            : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        horariosSaida: editingStudent.horariosSaida || {},
      };

      await Promise.resolve(onUpdateStudent(studentToSave));
      setEditingStudent(null);
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
    <div className="space-y-6">
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
                onClick={() => {
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
                <span>+ Importar Lista em Lote</span>
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
                {turmasList.map((t) => (
                  <option key={t} value={t}>
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Atividades Extracurriculares (Apenas com Chamada):
              </label>
              <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                {extracurricularRollCallActivities.length} modalidades oficiais
              </span>
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
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-indigo-300 text-sm flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>Importação de Alunos em Lote por Turma</span>
            </h3>
            <button
              type="button"
              disabled={isSavingBatch}
              onClick={() => setShowBatchForm(false)}
              className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {batchFormError && (
            <div className="p-3 text-xs bg-rose-900/50 border border-rose-700 text-rose-200 rounded-xl font-semibold">
              ⚠️ {batchFormError}
            </div>
          )}

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
                {turmasList.map((t) => (
                  <option key={t} value={t}>
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

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Cole a Relação de Nomes dos Alunos (1 nome por linha):
            </label>
            <textarea
              rows={5}
              placeholder={`Exemplo:\nAna Julia Santos\nBruno Henrique Lima\nCarolina Mendes\nDaniel Oliveira`}
              value={batchNamesText}
              disabled={isSavingBatch}
              onChange={(e) => setBatchNamesText(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-700 bg-slate-800 text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={isSavingBatch}
              onClick={() => setShowBatchForm(false)}
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
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Importar Alunos</span>
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
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => {
                  setEditingStudent(null);
                  setEditFormError(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
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
                  value={editingStudent.name}
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
                  value={editingStudent.turma}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, turma: e.target.value as TurmaType })
                  }
                  disabled={isSavingEdit || (!isCoordenador && allowedTurmas.length === 1)}
                  className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-medium ${
                    !isCoordenador && allowedTurmas.length === 1
                      ? 'bg-slate-100 cursor-not-allowed text-slate-600'
                      : 'text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500'
                  }`}
                >
                  {turmasList.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {!isCoordenador && allowedTurmas.length === 1 && (
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Atividades Extracurriculares (Apenas com Chamada):
                  </label>
                  <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    {extracurricularRollCallActivities.length} modalidades oficiais
                  </span>
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
            <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 z-10 flex justify-end space-x-2 shrink-0 shadow-xs">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => {
                  setEditingStudent(null);
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
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
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
                <span>Todos ({students.length})</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
            {statusFilter === 'ativos' && 'Exibindo apenas alunos com frequência regular ativa'}
            {statusFilter === 'inativos' && 'Exibindo alunos inativos e desligados (ocultos na chamada diária)'}
            {statusFilter === 'todos' && 'Exibindo base total de alunos matriculados e históricos'}
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
                    : `Todas Minhas Turmas (${students.filter((s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && allowedTurmas.includes(s.turma)).length} Alunos Ativos)`}
                </option>
              )}
              {turmasList.map((t) => {
                const count = students.filter(
                  (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && s.turma === t
                ).length;
                return (
                  <option key={t} value={t}>
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
              <option value="TODOS">Todas as Atividades ({totalAtivosCount} alunos)</option>
              {extracurricularRollCallActivities.map((a) => {
                const count = students.filter(
                  (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo' && (s.activities || []).includes(a.id)
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
            {filteredStudents.length} de {students.length} alunos
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
                  {turmasList.map((t) => (
                    <option key={t} value={t} disabled={t === transferringStudent.turma}>
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
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!studentToDelete) return;
                  if (!isCoordenador && currentUser && !allowedTurmas.includes(studentToDelete.turma)) {
                    setStudentToDelete(null);
                    return;
                  }
                  onDeleteStudent(studentToDelete.id);
                  setStudentToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sim, Excluir Aluno</span>
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
                    
                    onDeleteTurma(turmaToDelete, shouldDeleteStudents, targetReassign);
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
    </div>
  );
};
