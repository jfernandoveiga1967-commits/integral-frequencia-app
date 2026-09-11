import React, { useState } from 'react';
import { X, Save, Plus, Trash2, ChefHat, Sparkles } from 'lucide-react';
import { CookingRecipe } from '../../types/cardapio';

interface EditRecipeModalProps {
  isOpen: boolean;
  recipe: CookingRecipe | null;
  monthKey?: string;
  onClose: () => void;
  onSave: (recipe: CookingRecipe) => void;
}

export const EditRecipeModal: React.FC<EditRecipeModalProps> = ({
  isOpen,
  recipe,
  monthKey = '2026-09',
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState<string>(recipe?.title || '');
  const [weekLabel, setWeekLabel] = useState<string>(recipe?.weekLabel || 'PRIMEIRA SEMANA');
  const [weekNumber, setWeekNumber] = useState<1 | 2 | 3 | 4 | 5>(recipe?.weekNumber || 1);
  const [datesLabel, setDatesLabel] = useState<string>(recipe?.datesLabel || '03 E 04 DE SETEMBRO');
  const [category, setCategory] = useState<'doce' | 'salgado' | 'bebida' | 'lanche'>(
    recipe?.category || 'salgado'
  );
  const [prepTime, setPrepTime] = useState<string>(recipe?.prepTime || '40 minutos');
  const [servings, setServings] = useState<string>(recipe?.servings || '15 porções');
  const [ingredientsText, setIngredientsText] = useState<string>(
    recipe ? recipe.ingredients.join('\n') : ''
  );
  const [instructionsText, setInstructionsText] = useState<string>(
    recipe ? recipe.instructions.join('\n') : ''
  );
  const [nutritionalNotes, setNutritionalNotes] = useState<string>(
    recipe?.nutritionalNotes || ''
  );
  const [allergensText, setAllergensText] = useState<string>(
    recipe?.allergens ? recipe.allergens.join(', ') : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const ingredients = ingredientsText
      .split('\n')
      .map((i) => i.trim().replace(/^[•\-\*]\s*/, ''))
      .filter((i) => i.length > 0);

    const instructions = instructionsText
      .split('\n')
      .map((inst) => inst.trim().replace(/^\d+[\.\)]\s*/, ''))
      .filter((inst) => inst.length > 0);

    const allergens = allergensText
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const id = recipe?.id || `recipe_${Date.now()}`;

    const newRecipe: CookingRecipe = {
      id,
      monthKey: recipe?.monthKey || monthKey,
      weekNumber,
      title: title.trim(),
      weekLabel: weekLabel.trim(),
      datesLabel: datesLabel.trim(),
      category,
      prepTime: prepTime.trim() || undefined,
      servings: servings.trim() || undefined,
      ingredients,
      instructions,
      nutritionalNotes: nutritionalNotes.trim() || undefined,
      allergens: allergens.length > 0 ? allergens : undefined,
    };

    onSave(newRecipe);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <ChefHat className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {recipe ? 'Editar Receita da Oficina' : 'Nova Receita da Oficina de Culinária'}
              </h3>
              <p className="text-xs text-slate-400">
                Nutrição Escolar & Desenvolvimento Pedagógico
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Título e Categoria */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Nome da Receita *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Bolo de Abobrinha, Vitamina da Imunidade..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="salgado">Salgado</option>
                <option value="doce">Doce</option>
                <option value="bebida">Bebida / Suco</option>
                <option value="lanche">Lanche Saudável</option>
              </select>
            </div>
          </div>

          {/* Semana e Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Semana Letiva *
              </label>
              <input
                type="text"
                required
                value={weekLabel}
                onChange={(e) => setWeekLabel(e.target.value)}
                placeholder="Ex: PRIMEIRA SEMANA"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Dias de Aplicação (Quintas e Sextas) *
              </label>
              <input
                type="text"
                required
                value={datesLabel}
                onChange={(e) => setDatesLabel(e.target.value)}
                placeholder="Ex: 03 E 04 DE SETEMBRO"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Tempo de Preparo e Rendimento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Tempo Estimado
              </label>
              <input
                type="text"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="Ex: 40 minutos, 5 minutos..."
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Rendimento
              </label>
              <input
                type="text"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="Ex: 1 forma média (15 fatias), 4 copos..."
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Ingredientes (1 por linha) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Ingredientes (coloque um ingrediente por linha) *
              </label>
              <span className="text-[11px] text-slate-400">
                {ingredientsText.split('\n').filter(Boolean).length} itens
              </span>
            </div>
            <textarea
              required
              rows={5}
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder="2 xíc. De Abobrinha italiana&#10;3 ovos&#10;2 xíc. De Açúcar refinado&#10;1 xíc. de óleo&#10;3 xíc. de Farinha de trigo..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          {/* Modo de Preparo (1 passo por linha) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Modo de Preparo (coloque cada etapa em uma linha) *
              </label>
              <span className="text-[11px] text-slate-400">
                {instructionsText.split('\n').filter(Boolean).length} etapas
              </span>
            </div>
            <textarea
              required
              rows={5}
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder="Bata no liquidificador a abobrinha, os ovos, o açúcar, o óleo e a baunilha.&#10;Em uma tigela misture a farinha de trigo, a canela e o fermento.&#10;Acrescente a massa do liquidificador mexendo aos poucos.&#10;Coloque em uma forma untada e leve ao forno pré-aquecido a 180°C por 30-40 minutos."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Dica Nutricional e Alergênicos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Nota / Dica Nutricional (Opcional)
              </label>
              <input
                type="text"
                value={nutritionalNotes}
                onChange={(e) => setNutritionalNotes(e.target.value)}
                placeholder="Ex: RICO EM VITAMINAS A e C, Fibras e Antioxidantes"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Alergênicos (separados por vírgula)
              </label>
              <input
                type="text"
                value={allergensText}
                onChange={(e) => setAllergensText(e.target.value)}
                placeholder="Ex: Glúten, Ovos, Leite"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

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
              className="flex items-center space-x-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-amber-900/30 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Receita</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
