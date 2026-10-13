import React, { useState, useMemo, useEffect } from 'react';
import { Student, ActivityItem, UserProfile, DayOfWeek } from '../types';
import { generateNominalListPDF } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { isStudentScheduledForDay } from '../utils/dateUtils';
import { BookMarked, X, Search, Download, FileText, Users, Clock } from 'lucide-react';

export interface RosterReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  turmasList: string[];
  extracurricularRollCallActivities: ActivityItem[];
  currentUser?: UserProfile | null;
  defaultTurma?: string;
  defaultSpecialty?: string;
  defaultDay?: string;
}

export const RosterReportModal: React.FC<RosterReportModalProps> = ({
  isOpen,
  onClose,
  students,
  turmasList,
  extracurricularRollCallActivities,
  currentUser,
  defaultTurma = 'TODAS',
  defaultSpecialty = 'TODAS',
  defaultDay = 'todos',
}) => {
  const [nominalFilterSpecialty, setNominalFilterSpecialty] = useState<string>(defaultSpecialty);
  const [nominalFilterTurma, setNominalFilterTurma] = useState<string>(defaultTurma);
  const [nominalFilterDay, setNominalFilterDay] = useState<string>(defaultDay);
  const [nominalSearchTerm, setNominalSearchTerm] = useState<string>('');

  // Sincroniza com defaults ao abrir
  useEffect(() => {
    if (isOpen) {
      if (defaultSpecialty) setNominalFilterSpecialty(defaultSpecialty);
      if (defaultTurma) setNominalFilterTurma(defaultTurma);
      if (defaultDay) setNominalFilterDay(defaultDay);
    }
  }, [isOpen, defaultSpecialty, defaultTurma, defaultDay]);

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

  const totalAtivosCount = useMemo(() => {
    return (students || []).filter(
      (s) => (s.status || s.statusMatricula || 'ativo') === 'ativo'
    ).length;
  }, [students]);

  const nominalFilteredStudents = useMemo(() => {
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
    const isAllDays =
      !nominalFilterDay || nominalFilterDay === 'todos' || nominalFilterDay === 'TODOS';
    const search = normalizeStr(nominalSearchTerm);

    return (students || [])
      .filter((s) => {
        if (!s || typeof s !== 'object') return false;
        const st = s.status || s.statusMatricula || 'ativo';
        if (st !== 'ativo') return false;

        // Filtro por turma
        if (!isAllTurmas && s.turma !== nominalFilterTurma) {
          return false;
        }

        // Filtro por modalidade
        if (!isAllSpecialties) {
          if (isAllReforco) {
            const hasReforco =
              (Array.isArray(s.modalidadesEspeciais) &&
                s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'reforco')) ||
              (Array.isArray(s.specialties) &&
                s.specialties.some((m) => normalizeStr(m) === 'reforco')) ||
              (Array.isArray(s.activities) &&
                s.activities.some((act) => normalizeStr(act) === 'reforco'));
            if (!hasReforco) return false;
          } else if (isRotina) {
            // Modalidade Rotina: todos matriculados em Rotina, ou com Rotina em activities/especiais, ou sem atividades específicas
            const hasRotina =
              (Array.isArray(s.activities) &&
                s.activities.some((act) => normalizeStr(act) === 'rotina')) ||
              (Array.isArray(s.modalidadesEspeciais) &&
                s.modalidadesEspeciais.some((m) => normalizeStr(m) === 'rotina')) ||
              (Array.isArray(s.specialties) &&
                s.specialties.some((m) => normalizeStr(m) === 'rotina')) ||
              Boolean((s as any).activity && normalizeStr((s as any).activity) === 'rotina') ||
              (!s.activities || s.activities.length === 0);
            if (!hasRotina) return false;
          } else {
            const hasAct =
              Array.isArray(s.activities) &&
              s.activities.some(
                (act) => normalizeStr(act) === normalizeStr(nominalFilterSpecialty)
              );
            const hasSpec =
              (Array.isArray(s.modalidadesEspeciais) &&
                s.modalidadesEspeciais.some(
                  (m) => normalizeStr(m) === normalizeStr(nominalFilterSpecialty)
                )) ||
              (Array.isArray(s.specialties) &&
                s.specialties.some(
                  (m) => normalizeStr(m) === normalizeStr(nominalFilterSpecialty)
                ));
            if (!hasAct && !hasSpec) return false;
          }
        }

        // Filtro por dia da semana
        if (!isAllDays) {
          const scheduledOnDay = isStudentScheduledForDay(s, nominalFilterDay as DayOfWeek);
          if (!scheduledOnDay) return false;
        }

        // Busca por nome
        if (search && !normalizeStr(s.name).includes(search)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [students, nominalFilterSpecialty, nominalFilterTurma, nominalFilterDay, nominalSearchTerm]);

  const handleOpenNominalPDFPreview = () => {
    const result = generateNominalListPDF({
      specialty: nominalFilterSpecialty,
      turma: nominalFilterTurma,
      dayOfWeek: nominalFilterDay,
      students: students,
      currentUser: currentUser,
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

  const handleDownloadNominalPDFDirect = () => {
    generateNominalListPDF({
      specialty: nominalFilterSpecialty,
      turma: nominalFilterTurma,
      dayOfWeek: nominalFilterDay,
      students: students,
      currentUser: currentUser,
      saveImmediately: true,
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <BookMarked className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base sm:text-lg font-black tracking-wide">
                    Relações Nominais de Alunos
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full">
                    Lista Cadastral
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Relatório formal cadastral para impressão e controle de matrícula (sem elementos de chamada)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Fechar janela"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Controls Bar */}
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
            {/* Filter 1: Modalidade */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                1. Modalidade / Especial:
              </label>
              <select
                value={nominalFilterSpecialty}
                onChange={(e) => setNominalFilterSpecialty(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="TODAS">Todas as Modalidades</option>
                <option value="Rotina">Rotina</option>
                <option value="Reforço">⚡ Reforço Escolar (Modalidade Paralela)</option>
                {extracurricularRollCallActivities
                  .filter((a) => a.id !== 'Reforço' && a.id !== 'Rotina')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.id}
                    </option>
                  ))}
              </select>
            </div>

            {/* Filter 2: Turma */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                2. Turma / Ano Escolar:
              </label>
              <select
                value={nominalFilterTurma}
                onChange={(e) => setNominalFilterTurma(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="TODAS">Todas as Turmas ({totalAtivosCount} alunos)</option>
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
            </div>

            {/* Filter 3: Dia da Semana */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                3. Dia da Semana:
              </label>
              <select
                value={nominalFilterDay}
                onChange={(e) => setNominalFilterDay(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="todos">Todos os Dias da Semana (Seg a Sex)</option>
                <option value="segunda">Segunda-feira</option>
                <option value="terca">Terça-feira</option>
                <option value="quarta">Quarta-feira</option>
                <option value="quinta">Quinta-feira</option>
                <option value="sexta">Sexta-feira</option>
              </select>
            </div>

            {/* Filter 4: Buscar Nome */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Buscar por Nome:
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={nominalSearchTerm}
                  onChange={(e) => setNominalSearchTerm(e.target.value)}
                  placeholder="Filtrar aluno..."
                  className="w-full pl-8.5 pr-8 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-400"
                />
                {nominalSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setNominalSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action & Metric Banner */}
          <div className="px-5 py-3 bg-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                {nominalFilteredStudents.length}{' '}
                {nominalFilteredStudents.length === 1 ? 'Aluno Encontrado' : 'Alunos Encontrados'}
              </span>
              {nominalFilterSpecialty !== 'TODAS' && (
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-lg flex items-center space-x-1">
                  <span>Modalidade: {nominalFilterSpecialty === 'Rotina' ? 'Rotina' : nominalFilterSpecialty}</span>
                </span>
              )}
              {nominalFilterTurma !== 'TODAS' && (
                <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  Turma: {nominalFilterTurma}
                </span>
              )}
              {nominalFilterDay !== 'todos' && (
                <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-lg">
                  Dia:{' '}
                  {nominalFilterDay === 'segunda'
                    ? 'Segunda-feira'
                    : nominalFilterDay === 'terca'
                    ? 'Terça-feira'
                    : nominalFilterDay === 'quarta'
                    ? 'Quarta-feira'
                    : nominalFilterDay === 'quinta'
                    ? 'Quinta-feira'
                    : 'Sexta-feira'}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadNominalPDFDirect}
                disabled={nominalFilteredStudents.length === 0}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-40 transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                title="Baixar diretamente o arquivo PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar PDF</span>
              </button>

              <button
                type="button"
                onClick={handleOpenNominalPDFPreview}
                disabled={nominalFilteredStudents.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center space-x-2"
                title="Visualizar e imprimir o relatório em PDF formal de lista cadastral"
              >
                <FileText className="w-4 h-4" />
                <span>Visualizar / Imprimir PDF</span>
              </button>
            </div>
          </div>

          {/* Scrollable Table View */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {nominalFilteredStudents.length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-3xl">
                <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Nenhum aluno encontrado</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Nenhum aluno ativo atende aos filtros de modalidade, turma ou dia da semana selecionados.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 font-bold text-center w-12">Nº</th>
                      <th className="py-2.5 px-4 font-bold">Nome do Aluno</th>
                      <th className="py-2.5 px-3 font-bold text-center">Turma</th>
                      <th className="py-2.5 px-3 font-bold text-center">Dias Frequência</th>
                      <th className="py-2.5 px-3 font-bold text-center">Horário Saída</th>
                      <th className="py-2.5 px-4 font-bold">Modalidades / Atividades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nominalFilteredStudents.map((student, idx) => {
                      const isReforco = Boolean(
                        (Array.isArray(student.modalidadesEspeciais) &&
                          student.modalidadesEspeciais.includes('Reforço')) ||
                          (Array.isArray(student.specialties) &&
                            student.specialties.includes('Reforço')) ||
                          (Array.isArray(student.activities) &&
                            student.activities.includes('Reforço'))
                      );

                      const formattedDays =
                        Array.isArray(student.diasFrequencia) &&
                        student.diasFrequencia.length > 0 &&
                        student.diasFrequencia.length < 5
                          ? student.diasFrequencia
                              .map((d) =>
                                d === 'segunda'
                                  ? 'Seg'
                                  : d === 'terca'
                                  ? 'Ter'
                                  : d === 'quarta'
                                  ? 'Qua'
                                  : d === 'quinta'
                                  ? 'Qui'
                                  : 'Sex'
                              )
                              .join(', ')
                          : 'Seg a Sex (Todos)';

                      const exitTime =
                        nominalFilterDay !== 'todos' &&
                        student.horariosSaida &&
                        student.horariosSaida[nominalFilterDay as DayOfWeek]
                          ? student.horariosSaida[nominalFilterDay as DayOfWeek]
                          : student.horarioSaida || '18:00';

                      return (
                        <tr key={student.id} className="hover:bg-slate-50 transition-colors">
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
                          <td className="py-2 px-3 text-center text-slate-700 font-semibold">
                            {student.turma}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600 font-medium">
                            {formattedDays}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-800">
                            {exitTime}
                          </td>
                          <td className="py-2 px-4 text-slate-600">
                            <div className="flex flex-wrap gap-1 items-center">
                              {(student.activities || []).map((act) => (
                                <span
                                  key={act}
                                  className="bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10.5px] font-medium"
                                >
                                  {act}
                                </span>
                              ))}
                              {(student.modalidadesEspeciais || [])
                                .filter((m) => !(student.activities || []).includes(m))
                                .map((m) => (
                                  <span
                                    key={m}
                                    className="bg-amber-50 border border-amber-300 text-amber-900 px-1.5 py-0.5 rounded text-[10.5px] font-bold"
                                  >
                                    {m}
                                  </span>
                                ))}
                              {(!student.activities || student.activities.length === 0) &&
                                (!student.modalidadesEspeciais ||
                                  student.modalidadesEspeciais.length === 0) && (
                                  <span className="text-slate-400 italic text-[11px]">
                                    Rotina Regular
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

          {/* Modal Footer */}
          <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              📋 Relação cadastral formal em ordem alfabética • Rigorosamente sem elementos de chamada diária
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer shadow-2xs ml-auto"
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

export default RosterReportModal;
