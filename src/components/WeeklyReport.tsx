import React, { useState } from 'react';
import { Student, AttendanceRecord, ActivityType, TurmaType, WeekInfo, ActivityItem } from '../types';
import { ACTIVITIES_LIST, TURMAS_LIST } from '../data/initialData';
import { ActivityBadge } from './ActivityBadge';
import { StatusBadge } from './StatusBadge';
import { generateStudentPDFReport, generateTurmaPDFReport } from '../utils/pdfGenerator';
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
} from 'lucide-react';

interface WeeklyReportProps {
  students: Student[];
  records: AttendanceRecord[];
  turmas?: string[];
  activitiesList?: ActivityItem[];
  currentWeek: WeekInfo;
  onDeleteTurma?: (turmaName: string, deleteStudents: boolean, targetTurmaToReassign?: string) => void;
}

export const WeeklyReport: React.FC<WeeklyReportProps> = ({
  students,
  records,
  turmas,
  activitiesList = ACTIVITIES_LIST,
  currentWeek,
  onDeleteTurma,
}) => {
  const activeActivities = activitiesList.length > 0 ? activitiesList : ACTIVITIES_LIST;
  const turmasList = React.useMemo(() => {
    const rawList = turmas && turmas.length > 0 ? turmas : TURMAS_LIST;
    return [...rawList].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [turmas]);

  const sortedStudentsForPdf = React.useMemo(() => {
    return [...students].sort((a, b) => {
      const turmaCompare = a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true });
      if (turmaCompare !== 0) return turmaCompare;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [students]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPdfTurma, setSelectedPdfTurma] = useState<TurmaType>(turmasList[0] || '1º Ano Azul');
  const [selectedPdfStudentId, setSelectedPdfStudentId] = useState<string>(students[0]?.id || '');
  const [showTurmaModal, setShowTurmaModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);

  // Filter records for the current selected week
  const weekRecords = records.filter(
    (r) => r.weekNumber === currentWeek.weekNumber && r.year === currentWeek.year
  );

  const totalRecords = weekRecords.length;
  const presenteCount = weekRecords.filter((r) => r.status === 'presente').length;
  const faltaCount = weekRecords.filter((r) => r.status === 'falta').length;
  const saudeCount = weekRecords.filter((r) => r.status === 'saude').length;
  const semEquipamentoCount = weekRecords.filter((r) => r.status === 'sem_equipamento').length;

  const presenceRate = totalRecords > 0 ? Math.round((presenteCount / totalRecords) * 100) : 0;

  // Equipment missing records
  const equipmentRecords = weekRecords.filter((r) => r.status === 'sem_equipamento');

  // Stats per activity
  const activityStats = activeActivities.map((act) => {
    const actRecords = weekRecords.filter((r) => r.activity === act.id);
    const total = actRecords.length;
    const pres = actRecords.filter((r) => r.status === 'presente').length;
    const falta = actRecords.filter((r) => r.status === 'falta').length;
    const saude = actRecords.filter((r) => r.status === 'saude').length;
    const semEquip = actRecords.filter((r) => r.status === 'sem_equipamento').length;
    const rate = total > 0 ? Math.round((pres / total) * 100) : 0;

    return {
      activity: act.id,
      total,
      pres,
      falta,
      saude,
      semEquip,
      rate,
    };
  });

  // Stats per turma
  const turmaStats = turmasList.map((turma) => {
    const turmaStudents = students.filter((s) => s.turma === turma);
    const studentIdsInTurma = new Set(turmaStudents.map((s) => s.id));
    const turmaRecords = weekRecords.filter(
      (r) => r.turma === turma || studentIdsInTurma.has(r.studentId)
    );
    const total = turmaRecords.length;
    const pres = turmaRecords.filter((r) => r.status === 'presente').length;
    const falta = turmaRecords.filter((r) => r.status === 'falta').length;
    const saude = turmaRecords.filter((r) => r.status === 'saude').length;
    const semEquip = turmaRecords.filter((r) => r.status === 'sem_equipamento').length;
    const rate = total > 0 ? Math.round((pres / total) * 100) : 0;

    return {
      turma,
      total,
      pres,
      falta,
      saude,
      semEquip,
      rate,
    };
  });

  // Print handle
  const handlePrint = () => {
    window.print();
  };

  // CSV Export handle
  const handleExportCSV = () => {
    let csv = 'Aluno,Turma,Atividade,Data,Status,Detalhamento Equipamento,Observacao\n';

    weekRecords.forEach((r) => {
      const student = students.find((s) => s.id === r.studentId);
      const studentName = student ? student.name : r.studentId;
      const statusLabel =
        r.status === 'presente'
          ? 'Presente'
          : r.status === 'falta'
          ? 'Falta'
          : r.status === 'saude'
          ? 'Ausencia Saude'
          : 'Falta de Equipamento';

      csv += `"${studentName}","${r.turma}","${r.activity}","${r.date}","${statusLabel}","${
        r.equipmentMissingDetails || ''
      }","${r.observation || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Frequencia_Integral_Semana_${currentWeek.weekNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyNotificationText = (rec: AttendanceRecord) => {
    const student = students.find((s) => s.id === rec.studentId);
    const studentName = student ? student.name : 'Aluno';
    const text = `Prezados responsáveis pelo(a) aluno(a) ${studentName} (${rec.turma}):\nInformamos que na atividade de ${rec.activity} do Integral realizada no dia ${rec.date.split('-').reverse().join('/')}, o(a) aluno(a) esteve impossibilitado(a) de participar devido a: ${rec.equipmentMissingDetails || 'falta de uniforme/equipamento necessário'}.\nSolicitamos a gentileza de verificar o material no próximo dia da atividade.\nAtenciosamente, Coordenação do Integral.`;

    navigator.clipboard.writeText(text);
    setCopiedId(rec.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              Relatório de Desempenho
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Análise Semanal de Frequência e Ocorrências
          </h2>
          <p className="text-xs text-slate-500">
            Período: <span className="font-bold text-slate-800">{currentWeek.label}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={() => setShowTurmaModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5"
            title="Gerar PDF formatado por Turma"
          >
            <Users className="w-4 h-4 text-indigo-600" />
            <span>PDF por Turma</span>
          </button>

          <button
            onClick={() => setShowStudentModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer flex items-center space-x-1.5"
            title="Gerar PDF formatado individual do Aluno"
          >
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>PDF por Aluno</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Presença Geral */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Taxa de Presença
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-900">{presenceRate}%</span>
            <span className="text-xs text-emerald-700 font-semibold">
              ({presenteCount} presenças)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total de chamadas: {totalRecords}</p>
        </div>

        {/* Card 2: Falta de Equipamento / Flauta */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Falta de Equipamento
            </span>
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
              <Shirt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-orange-900">{semEquipamentoCount}</span>
            <span className="text-xs text-orange-800 font-semibold">ocorrências</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Uniforme, maiô, flauta, kimono, etc.
          </p>
        </div>

        {/* Card 3: Ausência por Saúde */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Motivo de Saúde
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-amber-900">{saudeCount}</span>
            <span className="text-xs text-amber-800 font-semibold">ausências</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Atestados e indisposição médica</p>
        </div>

        {/* Card 4: Faltas Gerais */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Faltas Gerais
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-rose-900">{faltaCount}</span>
            <span className="text-xs text-rose-800 font-semibold">faltas</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Ausências não justificadas</p>
        </div>
      </div>

      {/* Equipment Missing Detailed List Section */}
      <div className="bg-white border border-orange-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-orange-500 text-white rounded-lg">
              <Shirt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm md:text-base">
                Ocorrências de Falta de Equipamento / Flauta / Uniforme
              </h3>
              <p className="text-xs text-orange-900 font-medium">
                Alunos impedidos de realizar a atividade por ausência de material exigido.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold bg-orange-200 text-orange-900 px-3 py-1 rounded-full border border-orange-300">
            {equipmentRecords.length} caso(s)
          </span>
        </div>

        {equipmentRecords.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            🎉 Nenhuma ocorrência de falta de equipamento ou flauta registrada nesta semana!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {equipmentRecords.map((rec) => {
              const student = students.find((s) => s.id === rec.studentId);
              const studentName = student ? student.name : 'Aluno';

              return (
                <div
                  key={rec.id}
                  className="p-4 hover:bg-orange-50/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-sm">{studentName}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {rec.turma}
                      </span>
                      <ActivityBadge activity={rec.activity} size="sm" />
                    </div>

                    <div className="text-xs text-orange-900 font-semibold bg-orange-50 p-2 rounded-lg border border-orange-200 inline-block">
                      ⚠️ {rec.equipmentMissingDetails || 'Sem o material/equipamento necessário'}
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Data da Atividade: {rec.date.split('-').reverse().join('/')}
                    </div>
                  </div>

                  {/* Copy Notice Button */}
                  <div className="shrink-0 print:hidden">
                    <button
                      onClick={() => copyNotificationText(rec)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-orange-100 hover:text-orange-900 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1"
                      title="Copiar texto de aviso para enviar aos pais no WhatsApp/Agenda"
                    >
                      {copiedId === rec.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copiar Comunicado aos Pais</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-sm md:text-base flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span>Frequência por Atividade Extracurricular</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Atividade</th>
                <th className="px-4 py-3 text-center">Registros</th>
                <th className="px-4 py-3 text-center text-emerald-700">Presenças (%)</th>
                <th className="px-4 py-3 text-center text-orange-800">Sem Equipamento</th>
                <th className="px-4 py-3 text-center text-amber-800">Saúde</th>
                <th className="px-4 py-3 text-center text-rose-700">Faltas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activityStats.map((stat) => (
                <tr key={stat.activity} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <ActivityBadge activity={stat.activity} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{stat.total}</td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-700">
                    {stat.pres} ({stat.rate}%)
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-orange-800">
                    {stat.semEquip}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-amber-800">
                    {stat.saude}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-rose-700">
                    {stat.falta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Turma Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-sm md:text-base">
            Frequência por Turma / Ano Escolar
          </h3>
          <span className="text-xs text-slate-400">Clique para baixar o relatório em PDF de cada turma</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Turma</th>
                <th className="px-4 py-3 text-center">Registros</th>
                <th className="px-4 py-3 text-center text-emerald-700">Presenças (%)</th>
                <th className="px-4 py-3 text-center text-orange-800">Sem Equipamento</th>
                <th className="px-4 py-3 text-center text-amber-800">Saúde</th>
                <th className="px-4 py-3 text-center text-rose-700">Faltas</th>
                <th className="px-4 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {turmaStats.map((stat) => (
                <tr key={stat.turma} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-bold text-slate-900">{stat.turma}</td>
                  <td className="px-4 py-3 text-center font-medium">{stat.total}</td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-700">
                    {stat.pres} ({stat.rate}%)
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-orange-800">
                    {stat.semEquip}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-amber-800">
                    {stat.saude}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-rose-700">
                    {stat.falta}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => generateTurmaPDFReport(stat.turma, currentWeek, students, records)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all cursor-pointer inline-flex items-center space-x-1"
                      title="Baixar PDF do relatório desta turma"
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

      {/* Modal: Download Turma PDF */}
      {showTurmaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-indigo-600">
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Baixar Relatório em PDF por Turma</h3>
                <p className="text-xs text-slate-500">Selecione a turma desejada para gerar o PDF.</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-slate-700">
                Turma / Ano Escolar:
              </label>
              <select
                value={selectedPdfTurma}
                onChange={(e) => setSelectedPdfTurma(e.target.value as TurmaType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
              >
                {turmasList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Conteúdo do PDF:</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                <li>Lista de alunos matriculados na turma</li>
                <li>Taxa de presença e faltas por aluno</li>
                <li>Detalhes de ocorrências e materiais ausentes</li>
                <li>Campo de assinatura da coordenação</li>
              </ul>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTurmaModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  generateTurmaPDFReport(selectedPdfTurma, currentWeek, students, records);
                  setShowTurmaModal(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Gerar PDF da Turma</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Download Student PDF */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-blue-600">
              <div className="p-3 bg-blue-100 rounded-xl">
                <UserCheck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Baixar Relatório em PDF por Aluno</h3>
                <p className="text-xs text-slate-500">Selecione o aluno para gerar o relatório individual.</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-slate-700">
                Selecione o Aluno(a):
              </label>
              <select
                value={selectedPdfStudentId}
                onChange={(e) => setSelectedPdfStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-500"
              >
                {sortedStudentsForPdf.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.turma})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Conteúdo do PDF Didático:</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                <li>Aproveitamento do aluno nas atividades</li>
                <li>Tabela com datas, presenças e ausências</li>
                <li>Avisos sobre materiais/equipamentos faltantes</li>
                <li>Campo para ciência e assinatura dos pais/responsáveis</li>
              </ul>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetStudent = students.find((s) => s.id === selectedPdfStudentId);
                  if (targetStudent) {
                    generateStudentPDFReport(targetStudent, currentWeek, records);
                  }
                  setShowStudentModal(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Gerar PDF do Aluno</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
