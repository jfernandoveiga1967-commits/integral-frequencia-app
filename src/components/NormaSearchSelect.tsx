import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Sparkles,
  BookOpen,
  ChevronDown,
  Check,
  AlertCircle,
  ShieldCheck,
  Heart,
  Loader2,
  Tag,
} from 'lucide-react';
import { ManualNorma } from '../types/manualNormas';

interface NormaSearchSelectProps {
  normas: ManualNorma[];
  selectedNormId: string;
  onSelectNorm: (normId: string) => void;
  onAutoMatchAi?: () => void;
  isMatchingAi?: boolean;
  hasContext?: boolean;
  autoMatchReason?: string | null;
}

export const getNormaBadgeConfig = (norm: ManualNorma) => {
  const isSensivel =
    norm.moduleId === 'guia_sensivel' ||
    (norm.tags && norm.tags.some((t) => t.toLowerCase().includes('sensiv')));

  if (isSensivel) {
    return {
      label: '🟣 Sensível',
      bgClass: 'bg-purple-50 text-purple-700 border-purple-200',
      dotClass: 'bg-purple-500',
    };
  }

  if (norm.type === 'proibicao' || norm.type === 'alerta') {
    return {
      label: '🔴 Proibição',
      bgClass: 'bg-rose-50 text-rose-700 border-rose-200',
      dotClass: 'bg-rose-500',
    };
  }

  return {
    label: '🟢 Boa Prática',
    bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  };
};

export const NormaSearchSelect: React.FC<NormaSearchSelectProps> = ({
  normas,
  selectedNormId,
  onSelectNorm,
  onAutoMatchAi,
  isMatchingAi = false,
  hasContext = false,
  autoMatchReason = null,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedNorm = useMemo(() => {
    return normas.find((n) => n.id === selectedNormId) || null;
  }, [normas, selectedNormId]);

  // Filtro instantâneo com suporte a título, seção, categoria e palavras-chave (tags/resumo/detalhes)
  const filteredNormas = useMemo(() => {
    const clean = searchTerm.trim().toLowerCase();
    if (!clean) return normas;

    return normas.filter((norm) => {
      const matchTitle = (norm.title || '').toLowerCase().includes(clean);
      const matchSection = (norm.sectionNumber || '').toLowerCase().includes(clean);
      const matchModule =
        (norm.moduleTitle || '').toLowerCase().includes(clean) ||
        (norm.moduleId || '').toLowerCase().includes(clean);
      const matchSummary = (norm.summary || '').toLowerCase().includes(clean);
      const matchTags = Array.isArray(norm.tags) && norm.tags.some((t) => t.toLowerCase().includes(clean));
      const matchDetails =
        Array.isArray(norm.details) && norm.details.some((d) => d.toLowerCase().includes(clean));

      return (
        matchTitle ||
        matchSection ||
        matchModule ||
        matchSummary ||
        matchTags ||
        matchDetails
      );
    });
  }, [normas, searchTerm]);

  return (
    <div ref={containerRef} className="space-y-1.5 w-full relative">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-teal-600" />
          <span>Norma Institucional Vinculada:</span>
        </label>

        {/* Atalho Inteligente de IA: Auto-Match no Texto */}
        {onAutoMatchAi && (
          <button
            type="button"
            onClick={onAutoMatchAi}
            disabled={isMatchingAi || !hasContext}
            className="text-[11px] font-black text-teal-800 bg-teal-50 hover:bg-teal-100 hover:text-teal-900 border border-teal-300/80 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            title="Identificar e vincular a norma automaticamente a partir do fato relatado com IA"
          >
            {isMatchingAi ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                <span>Identificando com IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>[ ✨ Identificar Norma no Texto ]</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Caixa do Campo / Seletor */}
      <div className="relative">
        {selectedNorm && !isOpen ? (
          // Visualização da Norma Selecionada (Com badges e opção de troca)
          <div
            onClick={() => {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="w-full p-2.5 bg-teal-50/60 border border-teal-300 rounded-xl flex items-center justify-between gap-2 cursor-pointer hover:bg-teal-50 transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Badge de Alerta */}
              {(() => {
                const badge = getNormaBadgeConfig(selectedNorm);
                return (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shrink-0 ${badge.bgClass}`}
                  >
                    {badge.label}
                  </span>
                );
              })()}

              {/* Seção */}
              {(selectedNorm.sectionNumber || selectedNorm.section) && (
                <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10.5px] font-black shrink-0 shadow-2xs">
                  SEÇÃO {String(selectedNorm.sectionNumber || selectedNorm.section).replace(/^seção\s*/i, '')}
                </span>
              )}

              {/* Título */}
              <span className="text-xs font-bold text-slate-900 truncate">
                {selectedNorm.title}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNorm('');
                  setSearchTerm('');
                  setIsOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Limpar seleção e buscar outra norma"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
          </div>
        ) : (
          // Campo de Entrada para Busca com Autocomplete
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Digite o título, número da seção (ex: 4), categoria ou palavras-chave..."
              className="w-full text-xs font-semibold pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-800 placeholder-slate-400 shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Dropdown de Resultados com badges elegantes */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-2 bg-slate-50/80 text-[11px] font-bold text-slate-500 flex items-center justify-between border-b border-slate-100">
              <span>{filteredNormas.length} normas encontradas no acervo</span>
              <span className="text-[10px] text-slate-400">Pressione ESC para fechar</span>
            </div>

            {filteredNormas.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Nenhuma norma encontrada para &quot;{searchTerm}&quot;. Tente outro termo ou limpe a busca.
              </div>
            ) : (
              filteredNormas.map((norm) => {
                const isSelected = norm.id === selectedNormId;
                const badge = getNormaBadgeConfig(norm);

                return (
                  <button
                    key={norm.id}
                    type="button"
                    onClick={() => {
                      onSelectNorm(norm.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left p-3 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50/80 text-teal-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Badge de Alerta */}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shrink-0 ${badge.bgClass}`}
                        >
                          {badge.label}
                        </span>

                        {/* Código da Seção */}
                        {(norm.sectionNumber || norm.section) && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10.5px] font-black border border-slate-700 shrink-0 shadow-2xs">
                            SEÇÃO {String(norm.sectionNumber || norm.section).replace(/^seção\s*/i, '')}
                          </span>
                        )}

                        {/* Módulo */}
                        {norm.moduleTitle && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            • {norm.moduleTitle}
                          </span>
                        )}
                      </div>

                      {/* Título da Norma */}
                      <p className="text-xs font-bold text-slate-900 leading-snug">
                        {norm.title}
                      </p>

                      {/* Resumo / Tags */}
                      {norm.summary && (
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {norm.summary}
                        </p>
                      )}

                      {/* Tags */}
                      {Array.isArray(norm.tags) && norm.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          {norm.tags.slice(0, 4).map((t, idx) => (
                            <span
                              key={idx}
                              className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 flex items-center gap-0.5"
                            >
                              <Tag className="w-2.5 h-2.5 text-slate-400" />
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-teal-600 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Explicação da Sugestão da IA (quando identificada) */}
      {autoMatchReason && selectedNorm && (
        <div className="flex items-center gap-1.5 text-[11px] text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-200 animate-in fade-in duration-200">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="font-semibold">Vínculo Automático por IA:</span>
          <span className="text-teal-900 italic">&quot;{autoMatchReason}&quot;</span>
        </div>
      )}
    </div>
  );
};
export default NormaSearchSelect;
