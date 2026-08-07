import React, { useState, useMemo } from 'react';
import { Student, AttendanceRecord, ActivityType, TurmaType, AttendanceStatus, WeekInfo } from '../types';
import { TURMAS_LIST, ACTIVITIES_LIST } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import { EquipmentModal } from './EquipmentModal';
import { getWeekDays } from '../utils/dateUtils';
import { generateTurmaPDFReport } from '../utils/pdfGenerator';
import { Search, Filter, CheckCircle2, XCircle, Stethoscope, Shirt, Save, Check, RotateCcw, AlertTriangle, FileText, Download } from 'lucide-react';

interface AttendanceSheetProps {
  students: Student[];
  records: AttendanceRecord[];
  turmas?: string[];
  currentWeek: WeekInfo;
  selectedDate: string; // YYYY-MM-DD
  onSaveRecord: (record: Omit<AttendanceRecord, 'id' | 'createdAt'>) => void;
  onBatchMarkPresent: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
  onClearRecords: (studentIds: string[], activity: ActivityType | 'TODAS', date: string) => void;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  students,
  records,
  turmas,
  currentWeek,
  selectedDate,
  onSaveRecord,
  onBatchMarkPresent,
  onClearRecords,
}) => {
  const turmasList = useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return [...rawList].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [turmas]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | 'TODAS'>('Natação');
  const [selectedTurma, setSelectedTurma] = useState<TurmaType | 'TODAS'>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Equipment modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
    activity: ActivityType;
    date: string;
    initialDetails?: string;
  }>({
    isOpen: false,
    studentId: '',
    studentName: '',
    activity: 'Natação',
    date: selectedDate,
  });

  // Observations edit state map (studentId_activity_date -> string)
  const [obsMap, setObsMap] = useState<Record<string, string>>({});

  const weekDays = useMemo(() => getWeekDays(currentWeek.startDate), [currentWeek.startDate]);

  // Filter students who are enrolled in the selected activity (or all if TODAS) and turma
  const filteredStudents = useMemo(() => {
    return students
      .filter((student) => {
        // Activity filter
        const matchesActivity =
          selectedActivity === 'TODAS' || student.activities.includes(selectedActivity);

        // Turma filter
        const matchesTurma = selectedTurma === 'TODAS' || student.turma === selectedTurma;

        // Search filter
        const matchesSearch =
          searchTerm.trim() === '' ||
          student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.turma.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesActivity && matchesTurma && matchesSearch;
      })
      .sort((a, b) => {
        const turmaCompare = a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true });
        if (turmaCompare !== 0) return turmaCompare;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [students, selectedActivity, selectedTurma, searchTerm]);

  // Create a fast map for quick record lookup: `${studentId}_${activity}_${date}`
  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach((rec) => {
      if (rec.weekNumber === currentWeek.weekNumber && rec.year === currentWeek.year) {
        const key = `${rec.studentId}_${rec.activity}_${rec.date}`;
        map.set(key, rec);
      }
    });
    return map;
  }, [records, currentWeek]);

  // Calculate status statistics for current filter and date
  const stats = useMemo(() => {
    let presente = 0;
    let falta = 0;
    let saude = 0;
    let semEquipamento = 0;
    let pendente = 0;

    filteredStudents.forEach((student) => {
      const activitiesToCount =
        selectedActivity === 'TODAS' ? student.activities : [selectedActivity];

      activitiesToCount.forEach((act) => {
        const key = `${student.id}_${act}_${selectedDate}`;
        const rec = recordMap.get(key);
        if (!rec) {
          pendente++;
        } else if (rec.status === 'presente') {
          presente++;
        } else if (rec.status === 'falta') {
          falta++;
        } else if (rec.status === 'saude') {
          saude++;
        } else if (rec.status === 'sem_equipamento') {
          semEquipamento++;
        }
      });
    });

    const total = presente + falta + saude + semEquipamento + pendente;
    return { presente, falta, saude, semEquipamento, pendente, total };
  }, [filteredStudents, selectedActivity, selectedDate, recordMap]);

  // Handlers for status click
  const handleStatusClick = (
    student: Student,
    activity: ActivityType,
    date: string,
    status: AttendanceStatus,
    equipmentDetails?: string,
    obs?: string
  ) => {
    if (status === 'sem_equipamento' && !equipmentDetails) {
      // Open modal to specify equipment
      const key = `${student.id}_${activity}_${date}`;
      const existingRec = recordMap.get(key);
      setModalState({
        isOpen: true,
        studentId: student.id,
        studentName: student.name,
        activity,
        date,
        initialDetails: existingRec?.equipmentMissingDetails || '',
      });
      return;
    }

    const key = `${student.id}_${activity}_${date}`;
    const currentObs = obs !== undefined ? obs : obsMap[key] || recordMap.get(key)?.observation || '';

    onSaveRecord({
      studentId: student.id,
      activity,
      turma: student.turma,
      date,
      weekNumber: currentWeek.weekNumber,
      year: currentWeek.year,
      status,
      equipmentMissingDetails: equipmentDetails,
      observation: currentObs || undefined,
    });
  };

  const handleEquipmentModalSave = (details: string) => {
    const student = students.find((s) => s.id === modalState.studentId);
    if (student) {
      handleStatusClick(
        student,
        modalState.activity,
        modalState.date,
        'sem_equipamento',
        details
      );
    }
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const areAllMarkedPresent = useMemo(() => {
    if (filteredStudents.length === 0) return false;
    return filteredStudents.every((student) => {
      const activitiesToCheck = selectedActivity === 'TODAS' ? student.activities : [selectedActivity];
      if (activitiesToCheck.length === 0) return false;
      return activitiesToCheck.every((act) => {
        const key = `${student.id}_${act}_${selectedDate}`;
        const rec = recordMap.get(key);
        return rec?.status === 'presente';
      });
    });
  }, [filteredStudents, selectedActivity, selectedDate, recordMap]);

  const handleBatchMarkAllPresent = () => {
    const studentIds = filteredStudents.map((s) => s.id);
    if (studentIds.length === 0) return;

    if (areAllMarkedPresent) {
      onClearRecords(studentIds, selectedActivity, selectedDate);
      setObsMap((prev) => {
        const next = { ...prev };
        filteredStudents.forEach((student) => {
          const acts = selectedActivity === 'TODAS' ? student.activities : [selectedActivity];
          acts.forEach((act) => {
            delete next[`${student.id}_${act}_${selectedDate}`];
          });
        });
        return next;
      });
    } else {
      onBatchMarkPresent(studentIds, selectedActivity, selectedDate);
    }
  };

  const handleClearSelected = () => {
    const studentIds = filteredStudents.map((s) => s.id);
    if (studentIds.length === 0) return;
    const actLabel = selectedActivity === 'TODAS' ? 'todas as atividades' : `a atividade "${selectedActivity}"`;
    if (window.confirm(`Tem certeza que deseja limpar as marcações de ${actLabel} no dia selecionado?`)) {
      onClearRecords(studentIds, selectedActivity, selectedDate);

      // Clear local observation state for cleared records
      setObsMap((prev) => {
        const next = { ...prev };
        filteredStudents.forEach((student) => {
          const acts = selectedActivity === 'TODAS' ? student.activities : [selectedActivity];
          acts.forEach((act) => {
            delete next[`${student.id}_${act}_${selectedDate}`];
          });
        });
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Equipment Modal */}
      <EquipmentModal
        isOpen={modalState.isOpen}
        studentName={modalState.studentName}
        activity={modalState.activity}
        initialDetails={modalState.initialDetails}
        onSave={handleEquipmentModalSave}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Control Panel / Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Activity Chips Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            1. Selecione a Atividade Extracurricular:
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedActivity('TODAS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                selectedActivity === 'TODAS'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Todas Atividades
            </button>
            {ACTIVITIES_LIST.map((act) => (
              <button
                key={act.id}
                onClick={() => setSelectedActivity(act.id)}
                className={`transition-all cursor-pointer ${
                  selectedActivity === act.id ? 'scale-105 shadow-sm ring-2 ring-indigo-500 ring-offset-1' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <ActivityBadge activity={act.id} size="md" />
              </button>
            ))}
          </div>
        </div>

        {/* Filters Grid (Turma, Day of week, Search) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          {/* Turma Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Turma / Ano Escolar:
            </label>
            <select
              value={selectedTurma}
              onChange={(e) => setSelectedTurma(e.target.value as TurmaType | 'TODAS')}
              className="w-full px-3 py-2 text-xs md:text-sm border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODAS">Todas as Turmas ({turmasList.length} Turmas)</option>
              {turmasList.map((turma) => (
                <option key={turma} value={turma}>
                  {turma}
                </option>
              ))}
            </select>
          </div>

          {/* Day of Week Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Dia da Chamada na Semana:
            </label>
            <div className="grid grid-cols-5 gap-1">
              {weekDays.map((day) => {
                const isSelected = selectedDate === day.dateStr;
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => {
                      // Call parent update
                      const event = new CustomEvent('app_select_date', { detail: day.dateStr });
                      window.dispatchEvent(event);
                    }}
                    className={`px-1.5 py-1.5 text-center rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div>{day.dayShort.split(' ')[0]}</div>
                    <div className="text-[10px] opacity-80">{day.dateStr.split('-')[2]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Buscar por Nome do Aluno:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Digite o nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Batch Actions and Counters Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 bg-slate-50/70 p-3 rounded-xl">
          {/* Status summary pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-slate-500 font-semibold">Resumo do Dia:</span>
            <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{stats.presente} Presentes</span>
            </span>
            <span className="px-2 py-1 rounded-md bg-orange-100 text-orange-900 border border-orange-200 flex items-center space-x-1">
              <Shirt className="w-3.5 h-3.5 text-orange-600" />
              <span>{stats.semEquipamento} Sem Equip.</span>
            </span>
            <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-200 flex items-center space-x-1">
              <Stethoscope className="w-3.5 h-3.5 text-amber-600" />
              <span>{stats.saude} Saúde</span>
            </span>
            <span className="px-2 py-1 rounded-md bg-rose-100 text-rose-800 border border-rose-200 flex items-center space-x-1">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>{stats.falta} Faltas</span>
            </span>
            {stats.pendente > 0 && (
              <span className="px-2 py-1 rounded-md bg-slate-200 text-slate-700 border border-slate-300">
                {stats.pendente} Não Registrados
              </span>
            )}
          </div>

          {/* Quick Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {selectedTurma !== 'TODAS' && (
              <button
                onClick={() => generateTurmaPDFReport(selectedTurma, currentWeek, students, records)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                title="Baixar relatório em PDF formatado desta turma"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>PDF da Turma</span>
              </button>
            )}

            <button
              onClick={handleBatchMarkAllPresent}
              disabled={filteredStudents.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs ${
                areAllMarkedPresent
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={
                areAllMarkedPresent
                  ? 'Todos estão marcados como presentes. Clique para desmarcar todos.'
                  : 'Marcar todos os alunos visíveis como presentes'
              }
            >
              {areAllMarkedPresent ? (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>Desmarcar Todos</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Marcar Todos Presentes</span>
                </>
              )}
            </button>

            <button
              onClick={handleClearSelected}
              disabled={filteredStudents.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center space-x-1"
              title="Limpar marcações deste dia"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Calling Roster Grid / Table */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3">
          <Filter className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">Nenhum aluno encontrado</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Nenhum aluno está cadastrado na atividade "{selectedActivity}" para a turma "{selectedTurma}" com o termo digitado.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold flex items-center space-x-2">
                <span>Lista de Chamada de Frequência</span>
                {selectedActivity !== 'TODAS' && <ActivityBadge activity={selectedActivity} size="sm" />}
              </h2>
              <p className="text-xs text-slate-400">
                {filteredStudents.length} aluno(s) listado(s) • Clique nos botões para registrar a presença ou justificativa de ausência.
              </p>
            </div>
            <div className="text-xs font-semibold bg-slate-800 text-indigo-300 px-3 py-1 rounded-lg border border-slate-700">
              Data: {selectedDate.split('-').reverse().join('/')}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredStudents.map((student) => {
              // Determine activities to display for this student
              const activitiesToDisplay =
                selectedActivity === 'TODAS'
                  ? student.activities
                  : student.activities.filter((a) => a === selectedActivity);

              return (
                <div key={student.id} className="p-4 hover:bg-slate-50/80 transition-colors space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Student Info */}
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0 border border-indigo-200">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-slate-900 text-sm md:text-base">
                            {student.name}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                            {student.turma}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Extracurricular Activities badges for this student */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {student.activities.map((act) => (
                        <span key={act} className="opacity-80">
                          <ActivityBadge activity={act} size="sm" />
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Attendance Controls per Activity */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {activitiesToDisplay.map((act) => {
                      const recKey = `${student.id}_${act}_${selectedDate}`;
                      const rec = recordMap.get(recKey);
                      const currentStatus = rec?.status;

                      return (
                        <div
                          key={act}
                          className={`p-3 rounded-xl border transition-all ${
                            currentStatus === 'presente'
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : currentStatus === 'sem_equipamento'
                              ? 'bg-orange-50/80 border-orange-200'
                              : currentStatus === 'saude'
                              ? 'bg-amber-50/80 border-amber-200'
                              : currentStatus === 'falta'
                              ? 'bg-rose-50/80 border-rose-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div className="flex items-center space-x-2">
                              <ActivityBadge activity={act} size="sm" />
                              {rec && <StatusBadge status={rec.status} equipmentDetails={rec.equipmentMissingDetails} size="sm" />}
                            </div>

                            {/* Attendance Status Action Buttons */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full lg:w-auto">
                              {/* 1. PRESENTE */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'presente')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border ${
                                  currentStatus === 'presente'
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                    : 'bg-white hover:bg-emerald-50 text-emerald-800 border-slate-200 hover:border-emerald-300'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Presente</span>
                              </button>

                              {/* 2. SEM EQUIPAMENTO (Uniforme / Flauta) */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'sem_equipamento')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border ${
                                  currentStatus === 'sem_equipamento'
                                    ? 'bg-orange-600 text-white border-orange-700 shadow-xs'
                                    : 'bg-white hover:bg-orange-50 text-orange-900 border-slate-200 hover:border-orange-300'
                                }`}
                                title="Ausência por falta de uniforme, flauta ou material"
                              >
                                <Shirt className="w-3.5 h-3.5" />
                                <span>Sem Equip.</span>
                              </button>

                              {/* 3. SAÚDE */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'saude')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border ${
                                  currentStatus === 'saude'
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                    : 'bg-white hover:bg-amber-50 text-amber-900 border-slate-200 hover:border-amber-300'
                                }`}
                                title="Ausência por motivo de saúde ou atestado médico"
                              >
                                <Stethoscope className="w-3.5 h-3.5" />
                                <span>Saúde</span>
                              </button>

                              {/* 4. FALTA */}
                              <button
                                type="button"
                                onClick={() => handleStatusClick(student, act, selectedDate, 'falta')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 border ${
                                  currentStatus === 'falta'
                                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                                    : 'bg-white hover:bg-rose-50 text-rose-800 border-slate-200 hover:border-rose-300'
                                }`}
                                title="Ausência por falta geral não justificada"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Falta</span>
                              </button>
                            </div>
                          </div>

                          {/* Optional Observation input */}
                          <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center space-x-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              placeholder="Observação opcional (ex: Atestado médico entregue, aviso dos pais)..."
                              value={obsMap[recKey] !== undefined ? obsMap[recKey] : rec?.observation || ''}
                              onChange={(e) => {
                                setObsMap((prev) => ({ ...prev, [recKey]: e.target.value }));
                              }}
                              onBlur={(e) => {
                                if (currentStatus) {
                                  handleStatusClick(student, act, selectedDate, currentStatus, rec?.equipmentMissingDetails, e.target.value);
                                }
                              }}
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded-md bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
