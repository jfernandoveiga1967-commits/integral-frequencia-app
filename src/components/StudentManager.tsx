import React, { useState } from 'react';
import { Student, ActivityType, TurmaType, AttendanceRecord, WeekInfo } from '../types';
import { TURMAS_LIST, ACTIVITIES_LIST } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { generateStudentPDFReport, generateTurmaPDFReport } from '../utils/pdfGenerator';
import { Users, UserPlus, FileText, Trash2, Edit3, Check, X, Search, Sparkles, Download } from 'lucide-react';

interface StudentManagerProps {
  students: Student[];
  records?: AttendanceRecord[];
  currentWeek?: WeekInfo;
  onAddStudent: (student: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (names: string[], turma: TurmaType, activities: ActivityType[]) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students,
  records = [],
  currentWeek = { weekNumber: 32, year: 2026, startDate: '2026-08-03', endDate: '2026-08-07', label: 'Semana 32 (03/08 - 07/08)' },
  onAddStudent,
  onBatchAddStudents,
  onUpdateStudent,
  onDeleteStudent,
}) => {
  const [selectedTurma, setSelectedTurma] = useState<TurmaType | 'TODAS'>('TODAS');
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | 'TODAS'>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');

  // Single Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTurma, setNewTurma] = useState<TurmaType>(TURMAS_LIST[0]);
  const [newActivities, setNewActivities] = useState<ActivityType[]>(['Natação', 'Flauta']);

  // Batch Add state
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchNamesText, setBatchNamesText] = useState('');
  const [batchTurma, setBatchTurma] = useState<TurmaType>(TURMAS_LIST[0]);
  const [batchActivities, setBatchActivities] = useState<ActivityType[]>(['Natação']);

  // Edit & Delete modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  // Form error messages (replacing browser alert windows)
  const [singleFormError, setSingleFormError] = useState<string | null>(null);
  const [batchFormError, setBatchFormError] = useState<string | null>(null);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  const filteredStudents = students.filter((student) => {
    const matchesTurma = selectedTurma === 'TODAS' || student.turma === selectedTurma;
    const matchesActivity =
      selectedActivity === 'TODAS' || student.activities.includes(selectedActivity);
    const matchesSearch =
      searchTerm.trim() === '' ||
      student.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTurma && matchesActivity && matchesSearch;
  });

  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setSingleFormError(null);
    if (!newName.trim()) {
      setSingleFormError('Por favor, digite o nome do aluno.');
      return;
    }
    if (newActivities.length === 0) {
      setSingleFormError('Selecione pelo menos uma atividade para o aluno.');
      return;
    }
    onAddStudent({
      name: newName.trim(),
      turma: newTurma,
      activities: newActivities,
    });
    setNewName('');
    setShowAddForm(false);
  };

  const handleBatchAddSubmit = (e: React.FormEvent) => {
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
    if (batchActivities.length === 0) {
      setBatchFormError('Selecione pelo menos uma atividade para esta turma.');
      return;
    }

    onBatchAddStudents(names, batchTurma, batchActivities);
    setBatchNamesText('');
    setShowBatchForm(false);
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    setEditFormError(null);
    if (!editingStudent) return;
    if (!editingStudent.name.trim()) {
      setEditFormError('O nome do aluno não pode ficar em branco.');
      return;
    }
    if (editingStudent.activities.length === 0) {
      setEditFormError('Selecione pelo menos uma atividade.');
      return;
    }
    onUpdateStudent(editingStudent);
    setEditingStudent(null);
  };

  const toggleActivityInList = (
    currentList: ActivityType[],
    activity: ActivityType
  ): ActivityType[] => {
    if (currentList.includes(activity)) {
      return currentList.filter((a) => a !== activity);
    } else {
      return [...currentList, activity];
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
              >
                {TURMAS_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Atividades Extracurriculares do Aluno (Marque as aplicáveis):
            </label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES_LIST.map((act) => {
                const isSelected = newActivities.includes(act.id);
                return (
                  <button
                    type="button"
                    key={act.id}
                    onClick={() =>
                      setNewActivities(toggleActivityInList(newActivities, act.id))
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border flex items-center space-x-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{act.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-indigo-100">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer flex items-center space-x-1"
            >
              <Check className="w-4 h-4" />
              <span>Salvar Aluno</span>
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
              onClick={() => setShowBatchForm(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Turma de Destino:
              </label>
              <select
                value={batchTurma}
                onChange={(e) => setBatchTurma(e.target.value as TurmaType)}
                className="w-full px-3 py-2 text-sm border border-slate-700 bg-slate-800 text-white rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {TURMAS_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Atividades dessa Turma (Serão atribuídas a todos da lista):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITIES_LIST.map((act) => {
                  const isSelected = batchActivities.includes(act.id);
                  return (
                    <button
                      type="button"
                      key={act.id}
                      onClick={() =>
                        setBatchActivities(toggleActivityInList(batchActivities, act.id))
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border ${
                        isSelected
                          ? 'bg-indigo-500 text-white border-indigo-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {act.id}
                    </button>
                  );
                })}
              </div>
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
              onChange={(e) => setBatchNamesText(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-700 bg-slate-800 text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowBatchForm(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md cursor-pointer flex items-center space-x-1"
            >
              <Check className="w-4 h-4" />
              <span>Importar Alunos</span>
            </button>
          </div>
        </form>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleEditSave}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                <span>Editar Cadastro do Aluno</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do Aluno:
              </label>
              <input
                type="text"
                value={editingStudent.name}
                onChange={(e) =>
                  setEditingStudent({ ...editingStudent, name: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-bold text-slate-900"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-medium text-slate-800"
              >
                {TURMAS_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Atividades Extracurriculares:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITIES_LIST.map((act) => {
                  const isChecked = editingStudent.activities.includes(act.id);
                  return (
                    <button
                      type="button"
                      key={act.id}
                      onClick={() =>
                        setEditingStudent({
                          ...editingStudent,
                          activities: toggleActivityInList(editingStudent.activities, act.id),
                        })
                      }
                      className={`p-2 rounded-xl text-xs font-semibold border text-left flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-indigo-50 text-indigo-900 border-indigo-300 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <ActivityBadge activity={act.id} size="sm" />
                      </div>
                      <span className="text-indigo-600">{isChecked ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Filtrar por Turma:
          </label>
          <select
            value={selectedTurma}
            onChange={(e) => setSelectedTurma(e.target.value as TurmaType | 'TODAS')}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-medium"
          >
            <option value="TODAS">Todas as Turmas ({students.length} Alunos)</option>
            {TURMAS_LIST.map((t) => {
              const count = students.filter((s) => s.turma === t).length;
              return (
                <option key={t} value={t}>
                  {t} ({count} alunos)
                </option>
              );
            })}
          </select>
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
            <option value="TODAS">Todas as Atividades</option>
            {ACTIVITIES_LIST.map((a) => {
              const count = students.filter((s) => s.activities.includes(a.id)).length;
              return (
                <option key={a.id} value={a.id}>
                  {a.name} ({count} alunos)
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
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 text-sm md:text-base">
                      {student.name}
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                      {student.turma}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {student.activities.map((act) => (
                      <ActivityBadge key={act} activity={act} size="sm" />
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-end md:self-center">
                  <button
                    onClick={() => generateStudentPDFReport(student, currentWeek, records)}
                    className="p-2 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-semibold"
                    title="Baixar relatório de frequência em PDF deste aluno"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Relatório PDF</span>
                  </button>

                  <button
                    onClick={() => setEditingStudent(student)}
                    className="p-2 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1 text-xs font-semibold"
                    title="Editar aluno e atividades"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>

                  <button
                    onClick={() => setStudentToDelete(student)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer"
                    title="Excluir aluno"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
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
    </div>
  );
};
