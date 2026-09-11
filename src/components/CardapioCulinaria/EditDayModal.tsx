import React, { useState } from 'react';
import { X, Save, Check, Calendar, AlertCircle } from 'lucide-react';
import { MenuItemDay } from '../../types/cardapio';
import { formatDateBR } from '../../utils/dateUtils';

interface EditDayModalProps {
  isOpen: boolean;
  day: MenuItemDay | null;
  onClose: () => void;
  onSave: (updatedDay: MenuItemDay) => void;
}

export const EditDayModal: React.FC<EditDayModalProps> = ({
  isOpen,
  day,
  onClose,
  onSave,
}) => {
  if (!isOpen || !day) return null;

  const [isHoliday, setIsHoliday] = useState<boolean>(!!day.isHoliday);
  const [holidayDesc, setHolidayDesc] = useState<string>(day.holidayDescription || 'FERIADO');
  const [baseRice, setBaseRice] = useState<string>(day.base?.[0] || 'Arroz Branco');
  const [baseBeans, setBaseBeans] = useState<string>(day.base?.[1] || 'Feijão');
  const [protein, setProtein] = useState<string>(day.protein || '');
  const [garnish, setGarnish] = useState<string>(day.garnish || '');
  const [salad, setSalad] = useState<string>(day.salad || 'Salada');
  const [dessert, setDessert] = useState<string>(day.dessert || 'Fruta');
  const [specialNotes, setSpecialNotes] = useState<string>(day.specialNotes || '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: MenuItemDay = {
      ...day,
      isHoliday,
      holidayDescription: isHoliday ? holidayDesc : undefined,
      base: isHoliday ? [] : [baseRice.trim(), baseBeans.trim()].filter(Boolean),
      protein: isHoliday ? (holidayDesc || 'FERIADO') : protein.trim(),
      garnish: isHoliday ? '' : garnish.trim(),
      salad: isHoliday ? '' : salad.trim(),
      dessert: isHoliday ? '' : dessert.trim(),
      specialNotes: specialNotes.trim() || undefined,
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Editar Cardápio do Dia {day.dayNumber}
              </h3>
              <p className="text-xs text-slate-400">
                {formatDateBR(day.date)} • {day.weekIndex}ª Semana ({day.dayOfWeek.toUpperCase()})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Feriado Toggle */}
          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700 flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold text-white block">Marcar como Feriado / Recesso</label>
              <span className="text-xs text-slate-400">Não haverá almoço escolar neste dia</span>
            </div>
            <input
              type="checkbox"
              checked={isHoliday}
              onChange={(e) => setIsHoliday(e.target.checked)}
              className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          {isHoliday ? (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Descrição do Feriado / Recesso
              </label>
              <input
                type="text"
                value={holidayDesc}
                onChange={(e) => setHolidayDesc(e.target.value)}
                placeholder="Ex: FERIADO (Independência do Brasil)"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          ) : (
            <>
              {/* Arroz e Feijão */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Base 1 (Ex: Arroz)
                  </label>
                  <input
                    type="text"
                    value={baseRice}
                    onChange={(e) => setBaseRice(e.target.value)}
                    placeholder="Arroz Branco"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Base 2 (Ex: Feijão)
                  </label>
                  <input
                    type="text"
                    value={baseBeans}
                    onChange={(e) => setBaseBeans(e.target.value)}
                    placeholder="Feijão Carioca"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Prato Principal / Proteína */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Prato Principal / Proteína *
                </label>
                <input
                  type="text"
                  required
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  placeholder="Ex: Frango em tiras, Carne de panela, Iscas de pernil, etc."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Guarnição */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Guarnição / Acompanhamento
                </label>
                <input
                  type="text"
                  value={garnish}
                  onChange={(e) => setGarnish(e.target.value)}
                  placeholder="Ex: Creme de milho, Purê de batata, Farofa caseira, etc."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Salada e Sobremesa */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Salada
                  </label>
                  <input
                    type="text"
                    value={salad}
                    onChange={(e) => setSalad(e.target.value)}
                    placeholder="Salada / Vinagrete"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Sobremesa
                  </label>
                  <input
                    type="text"
                    value={dessert}
                    onChange={(e) => setDessert(e.target.value)}
                    placeholder="Fruta"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Observação / Alérgicos */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Observações / Substituição para Alérgicos (Opcional)
                </label>
                <input
                  type="text"
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="Ex: Opção sem lactose disponível sob aviso prévio"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Cardápio</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
