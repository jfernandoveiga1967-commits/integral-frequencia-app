import React, { useState } from 'react';
import { Student, AttendanceRecord, WeekInfo, TurmaType } from '../types';
import { getWeekInfo, getISOWeekNumber } from '../utils/dateUtils';
import { TURMAS_LIST } from '../data/initialData';
import { generateTurmaPDFReport } from '../utils/pdfGenerator';
import {
  Library,
  Calendar,
  Search,
  CheckCircle2,
  XCircle,
  Shirt,
  Stethoscope,
  ChevronRight,
  ClipboardCheck,
  BarChart3,
  Download,
  Filter,
  Layers,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface WeeklyLibraryProps {
  students: Student[];
  records: AttendanceRecord[];
  currentWeek: WeekInfo;
  onSelectWeek: (weekInfo: WeekInfo, targetTab?: 'frequencia' | 'relatorio') => void;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const WeeklyLibrary: React.FC<WeeklyLibraryProps> = ({
  students,
  records,
  currentWeek,
  onSelectWeek,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(currentWeek.year);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'with_records' | 'current'>('all');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<number | 'all'>('all');

  // Calculate actual ISO week of today
  const todayISO = getISOWeekNumber(new Date());

  // Generate list of 52 weeks for the selected year
  const allWeeks: WeekInfo[] = Array.from({ length: 52 }, (_, i) => getWeekInfo(selectedYear, i + 1));

  // Pre-calculate statistics per week strictly based on "Rotina" launches
  const weekStatsMap = new Map<
    number,
    {
      total: number;
      presente: number;
      falta: number;
      sem_equipamento: number;
      saude: number;
      rate: number;
      distinctDaysCount: number;
      mediaPresente: number;
      mediaFalta: number;
      mediaSaude: number;
    }
  >();

  // Map to store distinct dates with Rotina records per week
  const weekDatesMap = new Map<number, Set<string>>();

  // Aggregate records by week strictly for the modalidade "Rotina"
  (records || []).forEach((r) => {
    if (!r || r.year !== selectedYear) return;

    // Strict filter for Rotina activity
    const isRotina = r.activity === 'Rotina' || (r.activity && r.activity.trim().toLowerCase() === 'rotina');
    if (!isRotina) return;

    const existing = weekStatsMap.get(r.weekNumber) || {
      total: 0,
      presente: 0,
      falta: 0,
      sem_equipamento: 0,
      saude: 0,
      rate: 100,
      distinctDaysCount: 0,
      mediaPresente: 0,
      mediaFalta: 0,
      mediaSaude: 0,
    };

    let datesSet = weekDatesMap.get(r.weekNumber);
    if (!datesSet) {
      datesSet = new Set<string>();
      weekDatesMap.set(r.weekNumber, datesSet);
    }
    if (r.date) {
      datesSet.add(r.date);
    }

    existing.total += 1;
    if (r.status === 'presente' || r.status === 'saida_antecipada') existing.presente += 1;
    else if (r.status === 'falta') existing.falta += 1;
    else if (r.status === 'sem_equipamento') existing.sem_equipamento += 1;
    else if (r.status === 'saude') existing.saude += 1;

    weekStatsMap.set(r.weekNumber, existing);
  });

  // Calculate daily averages and attendance rate for each week with Rotina records
  weekStatsMap.forEach((stat, weekNum) => {
    const datesSet = weekDatesMap.get(weekNum);
    const distinctDays = datesSet && datesSet.size > 0 ? datesSet.size : 1;
    stat.distinctDaysCount = distinctDays;
    stat.mediaPresente = Math.round(stat.presente / distinctDays);
    stat.mediaFalta = Math.round(stat.falta / distinctDays);
    stat.mediaSaude = Math.round(stat.saude / distinctDays);
    stat.rate = stat.total > 0 ? Math.round((stat.presente / stat.total) * 100) : 100;
  });

  // Filter weeks based on search and selected filter
  const filteredWeeks = allWeeks.filter((w) => {
    const stats = weekStatsMap.get(w.weekNumber);
    const hasRecords = !!(stats && stats.total > 0);
    const isCurrent = w.weekNumber === todayISO.weekNumber && w.year === todayISO.year;

    // Filter mode check
    if (filterMode === 'with_records' && !hasRecords) return false;
    if (filterMode === 'current' && !isCurrent) return false;

    // Month filter check
    const startDateObj = new Date(w.startDate + 'T12:00:00');
    if (selectedMonthFilter !== 'all' && startDateObj.getMonth() !== selectedMonthFilter) {
      return false;
    }

    // Search query check
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      const matchWeekNum = `semana ${w.weekNumber}`.includes(query) || `${w.weekNumber}` === query;
      const matchLabel = w.label.toLowerCase().includes(query);
      return matchWeekNum || matchLabel;
    }

    return true;
  });

  // Overall statistics for the selected year (Rotina only)
  const weeksWithDataCount = Array.from(weekStatsMap.values()).filter((s) => s.total > 0).length;
  const totalYearRecords = Array.from(weekStatsMap.values()).reduce((acc, s) => acc + s.total, 0);
  const totalYearPresences = Array.from(weekStatsMap.values()).reduce((acc, s) => acc + s.presente, 0);
  const globalYearRate = totalYearRecords > 0 ? Math.round((totalYearPresences / totalYearRecords) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Header Banner for Library */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-8 pointer-events-none">
          <Library className="w-64 h-64 text-indigo-400" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                    Acervo de Chamadas
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  Biblioteca de Semanas Letivas
                </h2>
              </div>
            </div>

            {/* Year Selector */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700">
              <span className="text-xs text-slate-400 font-medium">Ano Letivo:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
              >
                <option value={2026} className="bg-slate-900 text-white">2026</option>
                <option value={2025} className="bg-slate-900 text-white">2025</option>
                <option value={2027} className="bg-slate-900 text-white">2027</option>
              </select>
            </div>
          </div>

          <p className="text-slate-300 text-xs md:text-sm max-w-2xl">
            Acesse o histórico de qualquer semana do ano para consultar diários de classe, gerar chamadas passadas e emitir relatórios em PDF formatados por turma ou aluno.
          </p>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Semanas Arquivadas
              </span>
              <span className="text-lg md:text-xl font-bold text-indigo-300">
                {weeksWithDataCount} <span className="text-xs text-slate-400 font-normal">de 52</span>
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total Registros
              </span>
              <span className="text-lg md:text-xl font-bold text-white">
                {totalYearRecords} <span className="text-xs text-slate-400 font-normal">Rotina</span>
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Frequência Média
              </span>
              <span className="text-lg md:text-xl font-bold text-emerald-400">
                {globalYearRate}%
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Semana Atual
              </span>
              <span className="text-lg md:text-xl font-bold text-indigo-200">
                Semana {todayISO.weekNumber}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por número da semana ou data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Todas (52 Semanas)
            </button>

            <button
              onClick={() => setFilterMode('with_records')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border ${
                filterMode === 'with_records'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              Com Registros ({weeksWithDataCount})
            </button>

            <button
              onClick={() => setFilterMode('current')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border ${
                filterMode === 'current'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              Semana Atual (Semana {todayISO.weekNumber})
            </button>
          </div>
        </div>

        {/* Month Filter Selector */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 overflow-x-auto no-scrollbar">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Mês:</span>
          <button
            onClick={() => setSelectedMonthFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap cursor-pointer transition-all ${
              selectedMonthFilter === 'all'
                ? 'bg-indigo-100 text-indigo-800 font-bold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos os meses
          </button>
          {MONTH_NAMES.map((mName, idx) => (
            <button
              key={mName}
              onClick={() => setSelectedMonthFilter(idx)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium whitespace-nowrap cursor-pointer transition-all ${
                selectedMonthFilter === idx
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {mName}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Archived Weeks */}
      {filteredWeeks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Nenhuma semana encontrada</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Não encontramos semanas correspondentes aos filtros selecionados. Tente alterar o termo de busca ou limpar o filtro.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterMode('all');
              setSelectedMonthFilter('all');
            }}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all cursor-pointer inline-flex items-center space-x-1"
          >
            <span>Limpar Filtros</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWeeks.map((wInfo) => {
            const stats = weekStatsMap.get(wInfo.weekNumber);
            const hasRecords = stats && stats.total > 0;
            const isCurrentWeek = wInfo.weekNumber === todayISO.weekNumber && wInfo.year === todayISO.year;
            const startDateObj = new Date(wInfo.startDate + 'T12:00:00');
            const monthName = MONTH_NAMES[startDateObj.getMonth()];

            return (
              <div
                key={wInfo.weekNumber}
                className={`bg-white rounded-2xl border transition-all duration-200 p-5 flex flex-col justify-between space-y-4 hover:shadow-md ${
                  isCurrentWeek
                    ? 'border-indigo-400 ring-2 ring-indigo-500/20 bg-gradient-to-b from-indigo-50/30 to-white'
                    : hasRecords
                    ? 'border-slate-200'
                    : 'border-slate-200/80 opacity-80 hover:opacity-100'
                }`}
              >
                {/* Card Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                      {monthName} • {wInfo.year}
                    </span>

                    {isCurrentWeek ? (
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-indigo-600" />
                        <span>Semana Atual</span>
                      </span>
                    ) : hasRecords ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {stats.distinctDaysCount} {stats.distinctDaysCount === 1 ? 'dia letivo' : 'dias letivos'}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">
                        Sem registros
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Semana {wInfo.weekNumber}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {wInfo.startDate.split('-').reverse().slice(0, 2).join('/')} a{' '}
                      {wInfo.endDate.split('-').reverse().slice(0, 2).join('/')}/{wInfo.year}
                    </p>
                  </div>
                </div>

                {/* Metrics Breakdown if records exist */}
                {hasRecords && stats ? (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Taxa de Presença (Rotina):</span>
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200/60">
                        {stats.rate}%
                      </span>
                    </div>

                    {/* Média Diária Highlight Card */}
                    <div className="bg-white border border-slate-200/90 rounded-lg p-2.5 shadow-2xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Média Diária por Aluno
                      </div>
                      <div className="text-xs font-bold text-slate-800 flex items-center flex-wrap gap-1">
                        <span className="text-emerald-700 font-extrabold">{stats.mediaPresente} Presentes</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-rose-700 font-extrabold">{stats.mediaFalta} Faltas</span>
                        {stats.mediaSaude > 0 && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span className="text-amber-700 font-bold">{stats.mediaSaude} Saúde</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-center pt-1 border-t border-slate-200/60 text-[11px]">
                      <div>
                        <span className="block text-slate-400 text-[10px]">Média Pres.</span>
                        <span className="font-bold text-emerald-600">{stats.mediaPresente}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-[10px]">Média Faltas</span>
                        <span className="font-bold text-rose-600">{stats.mediaFalta}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-[10px]">Média Saúde</span>
                        <span className="font-bold text-amber-600">{stats.mediaSaude}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-[10px]">Dias Lançados</span>
                        <span className="font-bold text-indigo-600">{stats.distinctDaysCount}d</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50/60 border border-dashed border-slate-200 rounded-xl p-3 text-center">
                    <span className="text-xs text-slate-400 font-medium">
                      Nenhum lançamento registrado ainda
                    </span>
                  </div>
                )}

                {/* Card Actions */}
                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onSelectWeek(wInfo, 'frequencia')}
                    className="w-full py-2 px-2 rounded-xl text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center justify-center space-x-1"
                    title="Acessar folha de chamadas desta semana"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Fazer Chamada</span>
                  </button>

                  <button
                    onClick={() => onSelectWeek(wInfo, 'relatorio')}
                    className="w-full py-2 px-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center justify-center space-x-1"
                    title="Visualizar relatório semanal consolidado"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Relatório</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
