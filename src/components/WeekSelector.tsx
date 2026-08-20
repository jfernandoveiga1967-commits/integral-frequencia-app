import React from 'react';
import { WeekInfo } from '../types';
import { ChevronLeft, ChevronRight, Calendar, RotateCcw, Library } from 'lucide-react';

interface WeekSelectorProps {
  currentWeek: WeekInfo;
  selectedDate: string; // YYYY-MM-DD
  onWeekChange: (weekInfo: WeekInfo) => void;
  onDateChange: (dateStr: string) => void;
  onGoToCurrentWeek: () => void;
  onOpenLibrary?: () => void;
}

export const WeekSelector: React.FC<WeekSelectorProps> = ({
  currentWeek,
  selectedDate,
  onWeekChange,
  onDateChange,
  onGoToCurrentWeek,
  onOpenLibrary,
}) => {
  const handlePrevWeek = () => {
    let prevWeek = currentWeek.weekNumber - 1;
    let year = currentWeek.year;
    if (prevWeek < 1) {
      prevWeek = 52;
      year -= 1;
    }
    // calculate
    const { getWeekInfo } = require('../utils/dateUtils');
    const newWeek = getWeekInfo(year, prevWeek);
    onWeekChange(newWeek);
    onDateChange(newWeek.startDate);
  };

  const handleNextWeek = () => {
    let nextWeek = currentWeek.weekNumber + 1;
    let year = currentWeek.year;
    if (nextWeek > 52) {
      nextWeek = 1;
      year += 1;
    }
    const { getWeekInfo } = require('../utils/dateUtils');
    const newWeek = getWeekInfo(year, nextWeek);
    onWeekChange(newWeek);
    onDateChange(newWeek.startDate);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
      {/* Current Week Badge & Information */}
      <div className="flex items-center space-x-3 w-full md:w-auto">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-semibold shrink-0">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Período por Semana
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
              {currentWeek.year}
            </span>
          </div>
          <h2 className="text-base md:text-lg font-bold text-slate-900">
            {currentWeek.label}
          </h2>
        </div>
      </div>

      {/* Week Navigation Controls */}
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 space-x-1">
          <button
            onClick={handlePrevWeek}
            className="p-1.5 rounded-md hover:bg-white text-slate-700 hover:shadow-xs transition-all cursor-pointer flex items-center space-x-1 text-xs font-medium"
            title="Semana Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <button
            onClick={onGoToCurrentWeek}
            className="px-2.5 py-1.5 rounded-md bg-white text-indigo-700 font-medium text-xs shadow-xs hover:bg-indigo-50 transition-all cursor-pointer flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Hoje / Semana Atual</span>
          </button>

          <button
            onClick={handleNextWeek}
            className="p-1.5 rounded-md hover:bg-white text-slate-700 hover:shadow-xs transition-all cursor-pointer flex items-center space-x-1 text-xs font-medium"
            title="Próxima Semana"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Date Direct Input */}
        <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">Dia:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                onDateChange(e.target.value);
                const dateObj = new Date(e.target.value + 'T12:00:00');
                const { getISOWeekNumber, getWeekInfo } = require('../utils/dateUtils');
                const { year, weekNumber } = getISOWeekNumber(dateObj);
                onWeekChange(getWeekInfo(year, weekNumber));
              }
            }}
            className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
          />
        </div>

        {onOpenLibrary && (
          <button
            onClick={onOpenLibrary}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
            title="Abrir a Biblioteca de Semanas"
          >
            <Library className="w-3.5 h-3.5 text-indigo-600" />
            <span>Biblioteca</span>
          </button>
        )}
      </div>
    </div>
  );
};
