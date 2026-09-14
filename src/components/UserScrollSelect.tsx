import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, User, Phone, Check, X } from 'lucide-react';
import { UserProfile } from '../types';
import { formatPhoneDisplay, cleanPhoneNumber } from '../utils/whatsappUtils';

interface UserScrollSelectProps {
  label: string;
  selectedName: string;
  users: UserProfile[];
  placeholder?: string;
  badgeLabel?: string;
  accentColor?: 'amber' | 'blue' | 'slate' | 'sky' | 'indigo';
  onSelectUser: (user: UserProfile) => void;
  onClear?: () => void;
}

export const UserScrollSelect: React.FC<UserScrollSelectProps> = ({
  label,
  selectedName,
  users,
  placeholder = 'Selecione na lista...',
  badgeLabel,
  accentColor = 'slate',
  onSelectUser,
  onClear,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Foco automático no input de busca ao abrir
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Lista ordenada alfabeticamente e filtrada
  const sortedAndFilteredUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!searchTerm.trim()) return sorted;
    const term = searchTerm.toLowerCase().trim();
    return sorted.filter((u) => {
      const matchName = u.name.toLowerCase().includes(term);
      const matchCargo = (u.cargoLabel || u.role || '').toLowerCase().includes(term);
      const matchPhone = (u.phone || '').includes(term);
      return matchName || matchCargo || matchPhone;
    });
  }, [users, searchTerm]);

  const selectedUser = useMemo(() => {
    if (!selectedName.trim()) return null;
    return users.find((u) => u.name.trim().toLowerCase() === selectedName.trim().toLowerCase());
  }, [users, selectedName]);

  const accentStyles = {
    amber: {
      btnBorder: 'border-amber-300 focus:border-amber-500 focus:ring-amber-500/20',
      activeBg: 'bg-amber-50',
      tagBg: 'bg-amber-100 text-amber-900 border-amber-300',
    },
    blue: {
      btnBorder: 'border-blue-300 focus:border-blue-500 focus:ring-blue-500/20',
      activeBg: 'bg-blue-50',
      tagBg: 'bg-blue-100 text-blue-900 border-blue-300',
    },
    sky: {
      btnBorder: 'border-sky-300 focus:border-sky-500 focus:ring-sky-500/20',
      activeBg: 'bg-sky-50',
      tagBg: 'bg-sky-100 text-sky-900 border-sky-300',
    },
    indigo: {
      btnBorder: 'border-indigo-300 focus:border-indigo-500 focus:ring-indigo-500/20',
      activeBg: 'bg-indigo-50',
      tagBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    },
    slate: {
      btnBorder: 'border-slate-300 focus:border-slate-500 focus:ring-slate-500/20',
      activeBg: 'bg-slate-50',
      tagBg: 'bg-slate-100 text-slate-900 border-slate-300',
    },
  }[accentColor];

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
          {label}
        </label>
        {badgeLabel && (
          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
            {badgeLabel}
          </span>
        )}
      </div>

      {/* Trigger Container do Dropdown (div com role button para evitar botão aninhado) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs bg-white border rounded-lg shadow-2xs text-left cursor-pointer transition-all ${
          accentStyles.btnBorder
        } ${isOpen ? 'ring-2 ring-amber-500/20 border-amber-500' : ''}`}
      >
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedName ? (
            <span className="font-bold text-slate-900 truncate">{selectedName}</span>
          ) : (
            <span className="text-slate-400 font-medium">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center space-x-1 shrink-0 ml-1">
          {selectedName && onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Limpar seleção"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-amber-600' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown com Barra de Rolagem */}
      {isOpen && (
        <div className="absolute z-60 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Caixa de Busca Rápida */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar usuário por nome, cargo..."
                className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-medium placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista com Barra de Rolagem (Scrollable List) */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 divide-opacity-60 overscroll-contain">
            {sortedAndFilteredUsers.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                Nenhum colaborador encontrado com "{searchTerm}".
              </div>
            ) : (
              sortedAndFilteredUsers.map((user) => {
                const isSelected =
                  user.name.trim().toLowerCase() === selectedName.trim().toLowerCase();
                const phoneDisplay = formatPhoneDisplay(user.phone);

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      onSelectUser(user);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-amber-50/90 text-amber-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold truncate">{user.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="truncate max-w-[140px] text-slate-600 font-medium">
                          {user.cargoLabel || user.role}
                        </span>
                        {phoneDisplay && (
                          <span className="inline-flex items-center text-emerald-700 font-semibold shrink-0">
                            <Phone className="w-2.5 h-2.5 mr-0.5" />
                            {phoneDisplay}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium shrink-0">
                      Selecionar
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Rodapé informativo */}
          <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
            <span>{sortedAndFilteredUsers.length} colaboradores na lista</span>
            <span className="text-amber-700 font-semibold">Puxa o telefone automaticamente</span>
          </div>
        </div>
      )}
    </div>
  );
};
