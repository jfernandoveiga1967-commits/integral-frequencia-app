import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Sparkles, 
  X, 
  Search, 
  Edit3, 
  Check, 
  Phone, 
  Send, 
  MessageSquare, 
  Clock, 
  MapPin, 
  Save, 
  Filter, 
  Printer, 
  ChevronRight,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  User
} from 'lucide-react';
import { TurmaAtribuicao, UserProfile } from '../types';
import { formatPhoneDisplay, cleanPhoneNumber } from '../utils/whatsappUtils';
import { getFirstName, buildApoioWhatsAppUrl } from '../utils/atribuicoesStorage';
import { ApoioWhatsAppModal } from './ApoioWhatsAppModal';
import { UserScrollSelect } from './UserScrollSelect';

export interface QuadroAtribuicoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  atribuicoes: TurmaAtribuicao[];
  users: UserProfile[];
  currentUser: UserProfile | null;
  onSaveAtribuicao: (atribuicao: TurmaAtribuicao) => void;
  onBatchSaveAtribuicoes?: (items: TurmaAtribuicao[]) => void;
}

export const QuadroAtribuicoesModal: React.FC<QuadroAtribuicoesModalProps> = ({
  isOpen,
  onClose,
  atribuicoes,
  users,
  currentUser,
  onSaveAtribuicao,
  onBatchSaveAtribuicoes,
}) => {
  const isCoord = currentUser?.role === 'coordenador';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'todas' | 'minhas'>('todas');
  const [editingTurmaId, setEditingTurmaId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TurmaAtribuicao | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Apoio WhatsApp Modal state
  const [apoioModalState, setApoioModalState] = useState<{
    isOpen: boolean;
    destinatarioRole: 'adi' | 'monitora' | 'coordenador';
    destinatarioName: string;
    destinatarioPhone?: string;
    turmaName: string;
  }>({
    isOpen: false,
    destinatarioRole: 'adi',
    destinatarioName: '',
    destinatarioPhone: '',
    turmaName: '',
  });

  const staffNames = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.name).filter(Boolean))).sort();
  }, [users]);

  // User's assigned turmas
  const userTurmas = useMemo(() => {
    return new Set(currentUser?.allowedClassIds || currentUser?.assignedTurmas || []);
  }, [currentUser]);

  // Filtered atribuicoes list
  const filteredList = useMemo(() => {
    return atribuicoes.filter((item) => {
      if (filterMode === 'minhas' && !isCoord) {
        if (!userTurmas.has(item.turma)) return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.turma.toLowerCase().includes(term) ||
        item.monitoraName.toLowerCase().includes(term) ||
        item.adiName.toLowerCase().includes(term) ||
        (item.espacoBase || '').toLowerCase().includes(term) ||
        (item.observacao || '').toLowerCase().includes(term)
      );
    });
  }, [atribuicoes, filterMode, isCoord, userTurmas, searchTerm]);

  if (!isOpen) return null;

  const startEdit = (item: TurmaAtribuicao) => {
    setEditingTurmaId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingTurmaId(null);
    setEditForm(null);
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    onSaveAtribuicao(editForm);
    setEditingTurmaId(null);
    setEditForm(null);
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  const openApoioModal = (
    destinatarioRole: 'adi' | 'monitora',
    destinatarioName: string,
    destinatarioPhone: string | undefined,
    turmaName: string
  ) => {
    setApoioModalState({
      isOpen: true,
      destinatarioRole,
      destinatarioName,
      destinatarioPhone: destinatarioPhone || '',
      turmaName,
    });
  };

  // 1-Click WhatsApp Direct Launcher
  const triggerOneClickWhatsApp = (
    destinatarioName: string,
    destinatarioPhone: string | undefined,
    turmaName: string,
    role: 'adi' | 'monitora'
  ) => {
    const cleanNum = cleanPhoneNumber(destinatarioPhone);
    if (!cleanNum) {
      // Se não tem telefone, abre o modal para preencher
      openApoioModal(role, destinatarioName, destinatarioPhone, turmaName);
      return;
    }
    const url = buildApoioWhatsAppUrl(cleanNum, destinatarioName);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/30 text-amber-200 border border-amber-400/30">
                  Programa Integral • Colégio Crescer
                </span>
                <span className="text-xs text-amber-300/80 font-medium">
                  {atribuicoes.length} Turmas Cadastradas
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-black leading-tight truncate text-white">
                Quadro Geral de Atribuições
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-amber-100 transition-colors"
              title="Imprimir quadro de atribuições"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-amber-200 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Filter and Actions Bar */}
        <div className="px-5 py-3 bg-amber-50/40 border-b border-amber-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por turma, monitora ou ADI..."
                className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-xs"
              />
            </div>

            {/* Filter Toggle for Non-coordinators */}
            {!isCoord && userTurmas.size > 0 && (
              <div className="inline-flex rounded-xl bg-white p-0.5 border border-slate-300 shadow-xs text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterMode('todas')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    filterMode === 'todas'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas as Turmas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('minhas')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    filterMode === 'minhas'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Minha(s) Turma(s)
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-2 text-xs">
            {saveSuccessNotice && (
              <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold animate-in fade-in">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Atribuição salva com sucesso!</span>
              </span>
            )}
            <span className="text-slate-500 font-medium">
              Mostrando <strong>{filteredList.length}</strong> de {atribuicoes.length}
            </span>
          </div>
        </div>

        {/* Content Body: List / Grid */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {filteredList.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-sm">Nenhuma atribuição encontrada.</p>
              <p className="text-xs text-slate-400">Verifique o termo buscado ou limpe os filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredList.map((item) => {
                const isEditing = editingTurmaId === item.id;
                const isMyTurma = userTurmas.has(item.turma);

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs ${
                      isMyTurma
                        ? 'border-amber-400/80 bg-amber-50/20 ring-1 ring-amber-400/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                        <h3 className="font-extrabold text-sm text-slate-900 truncate">
                          {item.turma}
                        </h3>
                        {isMyTurma && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">
                            Sua Turma
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {item.horarioTurno || '11:40 às 17:40'}
                        </span>
                        {isCoord && !isEditing && (
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-100/50 transition-colors"
                            title="Editar atribuições desta turma"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-3 flex-1">
                      {isEditing && editForm ? (
                        /* Edit Mode Form (Coordinator) */
                        <div className="space-y-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200 animate-in fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <UserScrollSelect
                                label="Monitora Responsável:"
                                selectedName={editForm.monitoraName}
                                users={users}
                                placeholder="Selecione a monitora..."
                                accentColor="slate"
                                onSelectUser={(u) => {
                                  setEditForm({
                                    ...editForm,
                                    monitoraName: u.name,
                                    monitoraId: u.id,
                                    monitoraPhone: u.phone ? formatPhoneDisplay(u.phone) : editForm.monitoraPhone || '',
                                  });
                                }}
                                onClear={() => {
                                  setEditForm({
                                    ...editForm,
                                    monitoraName: '',
                                    monitoraId: '',
                                    monitoraPhone: '',
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                WhatsApp da Monitora:
                              </label>
                              <input
                                type="tel"
                                value={editForm.monitoraPhone || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, monitoraPhone: e.target.value })
                                }
                                placeholder="(XX) XXXXX-XXXX"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <UserScrollSelect
                                label="Sua ADI (Apoio da Turma):"
                                badgeLabel="ADI"
                                selectedName={editForm.adiName}
                                users={users}
                                placeholder="Selecione a ADI..."
                                accentColor="amber"
                                onSelectUser={(u) => {
                                  setEditForm({
                                    ...editForm,
                                    adiName: u.name,
                                    adiId: u.id,
                                    adiPhone: u.phone ? formatPhoneDisplay(u.phone) : editForm.adiPhone || '',
                                  });
                                }}
                                onClear={() => {
                                  setEditForm({
                                    ...editForm,
                                    adiName: '',
                                    adiId: '',
                                    adiPhone: '',
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-amber-900 mb-0.5">
                                WhatsApp de Sua ADI:
                              </label>
                              <input
                                type="tel"
                                value={editForm.adiPhone || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, adiPhone: e.target.value })
                                }
                                placeholder="(XX) XXXXX-XXXX"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                Horário do Turno:
                              </label>
                              <input
                                type="text"
                                value={editForm.horarioTurno || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, horarioTurno: e.target.value })
                                }
                                placeholder="11:40 às 17:40"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                                Espaço / Sala Base:
                              </label>
                              <input
                                type="text"
                                value={editForm.espacoBase || ''}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, espacoBase: e.target.value })
                                }
                                placeholder="Ex: Sala 04 / Pátio"
                                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                              Observações da Atribuição:
                            </label>
                            <input
                              type="text"
                              value={editForm.observacao || ''}
                              onChange={(e) =>
                                setEditForm({ ...editForm, observacao: e.target.value })
                              }
                              placeholder="Notas pedagógicas, rotinas específicas..."
                              className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg"
                            />
                          </div>

                          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-amber-200">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-3 py-1 text-xs font-bold text-slate-600 hover:text-slate-800"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Salvar Atribuição</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Read Mode Display */
                        <div className="space-y-2.5">
                          {/* Block: Sua ADI (Destacado e Conforme Especificação) */}
                          <div className="bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/90 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>Sua ADI:</span>
                              </div>
                              <div className="text-xs sm:text-sm font-extrabold text-amber-950 truncate">
                                {item.adiName}
                              </div>
                              <div className="text-[10px] text-amber-700/80 font-semibold flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5" />
                                <span>{formatPhoneDisplay(item.adiPhone) || 'Sem telefone cadastrado'}</span>
                              </div>
                            </div>

                            {/* WhatsApp Fast Buttons for ADI */}
                            <div className="flex items-center space-x-1 shrink-0">
                              {/* 1-Click WhatsApp Button */}
                              <button
                                type="button"
                                onClick={() => triggerOneClickWhatsApp(item.adiName, item.adiPhone, item.turma, 'adi')}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs active:scale-95 transition-all"
                                title={`Abrir WhatsApp direto com "${item.adiName}"`}
                              >
                                <Send className="w-3 h-3" />
                                <span>1-Clique</span>
                              </button>

                              {/* Custom Message / Edit Button */}
                              <button
                                type="button"
                                onClick={() => openApoioModal('adi', item.adiName, item.adiPhone, item.turma)}
                                className="p-1.5 rounded-lg text-emerald-800 hover:bg-emerald-100/60 border border-emerald-300 bg-emerald-50 transition-colors"
                                title="Personalizar mensagem antes de enviar"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Block: Monitora Responsável */}
                          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <Users className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>Monitora Responsável:</span>
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {item.monitoraName}
                              </div>
                              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5 text-slate-400" />
                                <span>{formatPhoneDisplay(item.monitoraPhone) || 'Sem telefone cadastrado'}</span>
                              </div>
                            </div>

                            {/* WhatsApp Fast Buttons for Monitora */}
                            <div className="flex items-center space-x-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => triggerOneClickWhatsApp(item.monitoraName, item.monitoraPhone, item.turma, 'monitora')}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold text-white bg-slate-700 hover:bg-slate-800 shadow-xs active:scale-95 transition-all"
                                title={`Abrir WhatsApp direto com "${item.monitoraName}"`}
                              >
                                <Send className="w-3 h-3 text-emerald-400" />
                                <span>1-Clique</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openApoioModal('monitora', item.monitoraName, item.monitoraPhone, item.turma)}
                                className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-200/80 border border-slate-300 bg-white transition-colors"
                                title="Personalizar mensagem antes de enviar"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Location & Observação */}
                          {(item.espacoBase || item.observacao) && (
                            <div className="text-[10px] text-slate-500 px-1 pt-1 border-t border-slate-100 flex items-center justify-between gap-2">
                              {item.espacoBase && (
                                <span className="flex items-center gap-1 truncate font-medium">
                                  <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  {item.espacoBase}
                                </span>
                              )}
                              {item.observacao && (
                                <span className="truncate italic text-slate-400 text-right">
                                  {item.observacao}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Mensagem padrão pré-formatada: <strong>"Olá, [Nome]! Preciso do seu apoio."</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-xs transition-colors"
          >
            Fechar Quadro
          </button>
        </div>
      </div>

      {/* Datalist of users for autocompletion */}
      <datalist id="staff-list">
        {staffNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Embedded Apoio WhatsApp Modal */}
      <ApoioWhatsAppModal
        isOpen={apoioModalState.isOpen}
        onClose={() => setApoioModalState((prev) => ({ ...prev, isOpen: false }))}
        destinatarioRole={apoioModalState.destinatarioRole}
        destinatarioName={apoioModalState.destinatarioName}
        destinatarioPhone={apoioModalState.destinatarioPhone}
        turmaName={apoioModalState.turmaName}
        onUpdatePhone={(newPhone) => {
          // Atualiza o telefone na atribuição correspondente
          const target = atribuicoes.find((a) => a.turma === apoioModalState.turmaName);
          if (target) {
            const updated = { ...target };
            if (apoioModalState.destinatarioRole === 'adi') {
              updated.adiPhone = newPhone;
            } else {
              updated.monitoraPhone = newPhone;
            }
            onSaveAtribuicao(updated);
          }
        }}
      />
    </div>
  );
};
