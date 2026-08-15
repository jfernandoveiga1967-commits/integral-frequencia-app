import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  Plus,
  Trash2,
  Edit2,
  MapPin,
  FileText,
  Sparkles,
  Info,
  Check,
  CheckCircle2,
  AlertCircle,
  Filter,
  Copy,
  ChevronDown,
  ChevronUp,
  Layers,
  Utensils,
  BookOpen,
  Waves,
  X,
  Calendar,
  CheckSquare,
  Square,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  HelpCircle,
  Download,
  Printer,
} from 'lucide-react';
import { ScheduleBlock, DayOfWeek, TurmaType, ActivityItem, ActivityType } from '../types';
import { ActivityBadge, renderActivityIcon } from './ActivityBadge';
import { sortTurmasPedagogical } from '../utils/turmaUtils';
import { generateWeeklySchedulePDF, generateDailyRoutinePDF } from '../utils/pdfGenerator';

interface ScheduleManagerProps {
  turmas: TurmaType[];
  activitiesList: ActivityItem[];
  schedules: ScheduleBlock[];
  onSaveScheduleBlock: (block: ScheduleBlock) => void;
  onDeleteScheduleBlock: (id: string) => void;
  onBatchSaveSchedules?: (
    blocks: ScheduleBlock[],
    deletedIds?: string[],
    newOrUpdatedOnly?: ScheduleBlock[]
  ) => void;
}

const DAYS_OF_WEEK: { id: DayOfWeek; label: string; short: string }[] = [
  { id: 'segunda', label: 'Segunda-feira', short: 'SEG' },
  { id: 'terca', label: 'Terça-feira', short: 'TER' },
  { id: 'quarta', label: 'Quarta-feira', short: 'QUA' },
  { id: 'quinta', label: 'Quinta-feira', short: 'QUI' },
  { id: 'sexta', label: 'Sexta-feira', short: 'SEX' },
];

const COMMON_LOCATIONS = [
  'Piscina',
  'Refeitório',
  'Quadra Coberta',
  'Campo de Futebol',
  'Sala de Balé / Dança',
  'Tatame / Judô',
  'Sala de Música',
  'Sala de Estudos / Lição',
  'Parquinho / Pátio',
  'Ateliê de Artes',
];

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  turmas,
  activitiesList,
  schedules,
  onSaveScheduleBlock,
  onDeleteScheduleBlock,
  onBatchSaveSchedules,
}) => {
  // Sort turmas in strict pedagogical order: Mini Maternal -> Maternal -> Infantil 1 -> Infantil 2 -> 1º Ano -> ... -> 6º Ano
  const sortedTurmas = useMemo(() => {
    return sortTurmasPedagogical(turmas);
  }, [turmas]);

  const [selectedTurma, setSelectedTurma] = useState<TurmaType>(() => {
    const sorted = sortTurmasPedagogical(turmas);
    return sorted[0] || 'Mini Maternal Azul';
  });

  // Keep selectedTurma valid if the available turmas change
  useEffect(() => {
    if (sortedTurmas.length > 0 && !sortedTurmas.includes(selectedTurma)) {
      setSelectedTurma(sortedTurmas[0]);
    }
  }, [sortedTurmas, selectedTurma]);

  // Modal State for New/Edit Block
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<ScheduleBlock | null>(null);

  // Form State
  const [formTurma, setFormTurma] = useState<TurmaType>(() => sortedTurmas[0] || '');
  const [formDayOfWeek, setFormDayOfWeek] = useState<DayOfWeek>('segunda');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formActivityId, setFormActivityId] = useState<ActivityType>(activitiesList[0]?.id || 'Rotina');
  const [formLocation, setFormLocation] = useState('');
  const [formGuidelines, setFormGuidelines] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // --- IN-FORM REPLICATION STATE (Modal 3: "Replicar este bloco automaticamente") ---
  const [formReplicationExpanded, setFormReplicationExpanded] = useState(false);
  const [formReplicateDays, setFormReplicateDays] = useState<DayOfWeek[]>([]);
  const [formReplicateTurmas, setFormReplicateTurmas] = useState<string[]>([]);

  // --- REPLICATION MODAL 1: Replicar Rotina Completa (Entre Turmas) ---
  const [isFullRoutineModalOpen, setIsFullRoutineModalOpen] = useState(false);
  const [fullRoutineTargetTurmas, setFullRoutineTargetTurmas] = useState<string[]>([]);
  const [fullRoutineOverwrite, setFullRoutineOverwrite] = useState(true);

  // --- REPLICATION MODAL 2: Replicar Dia Específico ---
  const [dayReplicateModal, setDayReplicateModal] = useState<{
    isOpen: boolean;
    sourceDay: DayOfWeek;
    sourceTurma: TurmaType;
  } | null>(null);
  const [dayReplicateMode, setDayReplicateMode] = useState<'same_turma_other_days' | 'other_turmas_same_day' | 'custom'>('same_turma_other_days');
  const [dayReplicateTargetDays, setDayReplicateTargetDays] = useState<DayOfWeek[]>([]);
  const [dayReplicateTargetTurmas, setDayReplicateTargetTurmas] = useState<string[]>([]);
  const [dayReplicateOverwrite, setDayReplicateOverwrite] = useState(true);

  // PDF Export Modal State
  const [isExportPdfModalOpen, setIsExportPdfModalOpen] = useState(false);
  const [pdfReportType, setPdfReportType] = useState<'weekly' | 'daily'>('weekly');
  const [pdfTargetTurma, setPdfTargetTurma] = useState<TurmaType | 'ALL'>(sortedTurmas[0] || '1º Ano Azul');
  const [pdfTargetDay, setPdfTargetDay] = useState<DayOfWeek>('segunda');

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleOpenExportPdfModal = () => {
    setPdfTargetTurma(selectedTurma);
    setIsExportPdfModalOpen(true);
  };

  const handleExecuteExportPdf = () => {
    try {
      if (pdfReportType === 'weekly') {
        generateWeeklySchedulePDF({
          turma: pdfTargetTurma,
          turmasList: sortedTurmas,
          schedules,
          activitiesList,
          schoolYear: new Date().getFullYear(),
        });
        showToast(
          pdfTargetTurma === 'ALL'
            ? 'PDF da Grade Semanal de todas as turmas gerado com sucesso!'
            : `PDF da Grade Semanal (${pdfTargetTurma}) gerado com sucesso!`,
          'success'
        );
      } else {
        const targetTurma = pdfTargetTurma === 'ALL' ? selectedTurma : pdfTargetTurma;
        generateDailyRoutinePDF({
          turma: targetTurma,
          dayOfWeek: pdfTargetDay,
          schedules,
          activitiesList,
          schoolYear: new Date().getFullYear(),
        });
        showToast(
          `PDF da Rotina Diária (${targetTurma} - ${DAYS_OF_WEEK.find((d) => d.id === pdfTargetDay)?.label}) gerado com sucesso!`,
          'success'
        );
      }
      setIsExportPdfModalOpen(false);
    } catch (err) {
      console.error('Error generating PDF:', err);
      showToast('Ocorreu um erro ao gerar o PDF. Verifique os dados e tente novamente.', 'error');
    }
  };

  // Filter schedules for the selected turma
  const currentTurmaSchedules = useMemo(() => {
    return schedules.filter((s) => s.turma === selectedTurma);
  }, [schedules, selectedTurma]);

  // Group schedules by day of the week and sort by startTime
  const schedulesByDay = useMemo(() => {
    const grouped: Record<DayOfWeek, ScheduleBlock[]> = {
      segunda: [],
      terca: [],
      quarta: [],
      quinta: [],
      sexta: [],
    };

    currentTurmaSchedules.forEach((item) => {
      if (grouped[item.dayOfWeek]) {
        grouped[item.dayOfWeek].push(item);
      }
    });

    // Sort each day chronologically
    Object.keys(grouped).forEach((day) => {
      grouped[day as DayOfWeek].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    return grouped;
  }, [currentTurmaSchedules]);

  // Open Modal for New Block
  const handleOpenNewBlock = (defaultDay?: DayOfWeek) => {
    const targetDay = defaultDay || 'segunda';
    setEditingBlock(null);
    setFormTurma(selectedTurma);
    setFormDayOfWeek(targetDay);
    setFormStartTime('');
    setFormEndTime('');
    setFormActivityId(activitiesList[0]?.id || 'Rotina');
    setFormLocation('');
    setFormGuidelines('');
    setFormError(null);
    setFormReplicationExpanded(false);
    setFormReplicateDays([targetDay]);
    setFormReplicateTurmas([selectedTurma]);
    setIsModalOpen(true);
  };

  // Open Modal for Editing Block
  const handleOpenEditBlock = (block: ScheduleBlock) => {
    setEditingBlock(block);
    setFormTurma(block.turma);
    setFormDayOfWeek(block.dayOfWeek);
    setFormStartTime(block.startTime);
    setFormEndTime(block.endTime);
    setFormActivityId(block.activityId);
    setFormLocation(block.location || '');
    setFormGuidelines(block.guidelines || '');
    setFormError(null);
    setFormReplicationExpanded(false);
    setFormReplicateDays([block.dayOfWeek]);
    setFormReplicateTurmas([block.turma]);
    setIsModalOpen(true);
  };

  // Helper actions for in-form replication
  const handleToggleFormReplicateDay = (dayId: DayOfWeek) => {
    setFormReplicateDays((prev) => {
      if (prev.includes(dayId)) {
        return prev.filter((d) => d !== dayId);
      } else {
        return [...prev, dayId];
      }
    });
  };

  const handleSelectAllFormDays = () => {
    setFormReplicateDays(DAYS_OF_WEEK.map((d) => d.id));
  };

  const handleSelectMWFDays = () => {
    setFormReplicateDays(['segunda', 'quarta', 'sexta']);
  };

  const handleSelectTTSDays = () => {
    setFormReplicateDays(['terca', 'quinta']);
  };

  const handleToggleFormReplicateTurma = (t: string) => {
    setFormReplicateTurmas((prev) => {
      if (prev.includes(t)) {
        return prev.filter((x) => x !== t);
      } else {
        return [...prev, t];
      }
    });
  };

  const handleSelectAllFormTurmas = () => {
    setFormReplicateTurmas([...sortedTurmas]);
  };

  const handleSelectInfantilFormTurmas = () => {
    setFormReplicateTurmas(
      sortedTurmas.filter((t) => t.includes('Maternal') || t.includes('Infantil'))
    );
  };

  const handleSelectFundamentalFormTurmas = () => {
    setFormReplicateTurmas(
      sortedTurmas.filter((t) => t.includes('Ano'))
    );
  };

  // Calculate unique registered time slots with activity details in the selected formTurma
  const registeredTurmaTimeSlots = useMemo(() => {
    if (!formTurma) return [];
    const turmaBlocks = schedules.filter((s) => s.turma === formTurma);
    const slotMap = new Map<
      string,
      {
        startTime: string;
        endTime: string;
        activityId: string;
        activityName: string;
        iconName?: string;
        location?: string;
        guidelines?: string;
        days: Set<DayOfWeek>;
      }
    >();

    turmaBlocks.forEach((b) => {
      if (b.startTime && b.endTime) {
        const key = `${b.startTime}_${b.endTime}_${b.activityId}`;
        const act = activitiesList.find((a) => a.id === b.activityId);
        const actName = act?.name || b.activityId;
        if (!slotMap.has(key)) {
          slotMap.set(key, {
            startTime: b.startTime,
            endTime: b.endTime,
            activityId: b.activityId,
            activityName: actName,
            iconName: act?.icon,
            location: b.location,
            guidelines: b.guidelines,
            days: new Set([b.dayOfWeek]),
          });
        } else {
          const item = slotMap.get(key)!;
          item.days.add(b.dayOfWeek);
          if (!item.location && b.location) item.location = b.location;
          if (!item.guidelines && b.guidelines) item.guidelines = b.guidelines;
        }
      }
    });

    return Array.from(slotMap.values()).sort((a, b) => {
      const timeCmp = a.startTime.localeCompare(b.startTime);
      if (timeCmp !== 0) return timeCmp;
      return a.activityName.localeCompare(b.activityName, 'pt-BR');
    });
  }, [schedules, formTurma, activitiesList]);

  // Calculate effective targets for form replication
  const effectiveFormTargetDays = useMemo(() => {
    if (!formReplicationExpanded || formReplicateDays.length === 0) {
      return [formDayOfWeek];
    }
    return formReplicateDays;
  }, [formReplicationExpanded, formReplicateDays, formDayOfWeek]);

  const effectiveFormTargetTurmas = useMemo(() => {
    if (!formReplicationExpanded || formReplicateTurmas.length === 0) {
      return [formTurma];
    }
    return formReplicateTurmas;
  }, [formReplicationExpanded, formReplicateTurmas, formTurma]);

  const totalFormBlocksToGenerate = effectiveFormTargetDays.length * effectiveFormTargetTurmas.length;

  // Handle Form Submit with Direct Batch Replication Support
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTurma) {
      setFormError('Selecione uma turma válida.');
      return;
    }
    if (!formStartTime || !formEndTime) {
      setFormError('Informe os horários de início e término.');
      return;
    }
    if (formStartTime >= formEndTime) {
      setFormError('O horário de término deve ser posterior ao horário de início.');
      return;
    }
    if (!formActivityId) {
      setFormError('Selecione uma atividade para o horário.');
      return;
    }

    const targetDays: DayOfWeek[] =
      formReplicationExpanded && formReplicateDays.length > 0
        ? formReplicateDays
        : [formDayOfWeek];

    const targetTurmas: string[] =
      formReplicationExpanded && formReplicateTurmas.length > 0
        ? formReplicateTurmas
        : [formTurma];

    const blocksToSave: ScheduleBlock[] = [];

    targetTurmas.forEach((t) => {
      targetDays.forEach((d) => {
        const isPrimarySlot = t === formTurma && d === formDayOfWeek;
        if (isPrimarySlot && editingBlock) {
          blocksToSave.push({
            id: editingBlock.id,
            turma: t,
            dayOfWeek: d,
            startTime: formStartTime,
            endTime: formEndTime,
            activityId: formActivityId,
            location: formLocation.trim() || undefined,
            guidelines: formGuidelines.trim() || undefined,
            createdAt: editingBlock.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          blocksToSave.push({
            id: `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${t.replace(/\s+/g, '_').toLowerCase()}_${d}`,
            turma: t,
            dayOfWeek: d,
            startTime: formStartTime,
            endTime: formEndTime,
            activityId: formActivityId,
            location: formLocation.trim() || undefined,
            guidelines: formGuidelines.trim() || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
    });

    if (blocksToSave.length === 1) {
      onSaveScheduleBlock(blocksToSave[0]);
      showToast(
        editingBlock ? 'Horário atualizado com sucesso!' : 'Novo horário cadastrado na grade!',
        'success'
      );
    } else {
      if (onBatchSaveSchedules) {
        const existingMap = new Map<string, ScheduleBlock>();
        schedules.forEach((s) => existingMap.set(s.id, s));
        blocksToSave.forEach((b) => existingMap.set(b.id, b));
        const updatedTotal = Array.from(existingMap.values());
        onBatchSaveSchedules(updatedTotal, [], blocksToSave);
      } else {
        blocksToSave.forEach((b) => onSaveScheduleBlock(b));
      }
      showToast(
        `✓ ${blocksToSave.length} blocos de horário salvos e replicados com sucesso no Firestore (${targetDays.length} dia(s) × ${targetTurmas.length} turma(s))!`,
        'success'
      );
    }

    setIsModalOpen(false);
  };

  // Handle Delete Confirmation
  const confirmDeleteBlock = () => {
    if (!blockToDelete) return;
    onDeleteScheduleBlock(blockToDelete.id);
    setBlockToDelete(null);
    showToast('Bloco de horário removido da grade.', 'success');
  };

  // --- REPLICATION 1: OPEN FULL ROUTINE MODAL ---
  const handleOpenFullRoutineModal = () => {
    if (currentTurmaSchedules.length === 0) {
      showToast(`A turma ${selectedTurma} não possui nenhum horário cadastrado para replicar.`, 'error');
      return;
    }
    const otherTurmas = sortedTurmas.filter((t) => t !== selectedTurma);
    setFullRoutineTargetTurmas(otherTurmas); // default to all other turmas
    setFullRoutineOverwrite(true);
    setIsFullRoutineModalOpen(true);
  };

  // Toggle selection for target turma in full replication
  const handleToggleFullRoutineTurma = (t: string) => {
    if (fullRoutineTargetTurmas.includes(t)) {
      setFullRoutineTargetTurmas(fullRoutineTargetTurmas.filter((item) => item !== t));
    } else {
      setFullRoutineTargetTurmas([...fullRoutineTargetTurmas, t]);
    }
  };

  const handleSelectAllFullRoutineTurmas = () => {
    const otherTurmas = sortedTurmas.filter((t) => t !== selectedTurma);
    setFullRoutineTargetTurmas(otherTurmas);
  };

  const handleDeselectAllFullRoutineTurmas = () => {
    setFullRoutineTargetTurmas([]);
  };

  // EXECUTE FULL ROUTINE REPLICATION
  const handleExecuteFullRoutineReplication = () => {
    if (fullRoutineTargetTurmas.length === 0) {
      showToast('Selecione pelo menos uma turma de destino.', 'error');
      return;
    }

    const sourceBlocks = currentTurmaSchedules;
    if (sourceBlocks.length === 0) {
      showToast('Nenhum horário cadastrado na turma de origem.', 'error');
      return;
    }

    const newBlocks: ScheduleBlock[] = [];
    const deletedIds: string[] = [];
    const targetTurmasSet = new Set(fullRoutineTargetTurmas);

    // If overwrite mode is chosen, find all existing blocks in the target turmas to delete
    if (fullRoutineOverwrite) {
      schedules.forEach((s) => {
        if (targetTurmasSet.has(s.turma)) {
          deletedIds.push(s.id);
        }
      });
    }

    // Generate new duplicated blocks for each target turma
    fullRoutineTargetTurmas.forEach((targetTurma) => {
      sourceBlocks.forEach((src) => {
        const duplicated: ScheduleBlock = {
          id: `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          turma: targetTurma,
          dayOfWeek: src.dayOfWeek,
          startTime: src.startTime,
          endTime: src.endTime,
          activityId: src.activityId,
          location: src.location || '',
          guidelines: src.guidelines || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newBlocks.push(duplicated);
      });
    });

    // Compute updated total schedules list
    let updatedTotalSchedules: ScheduleBlock[];
    if (fullRoutineOverwrite) {
      const deletedIdSet = new Set(deletedIds);
      const preserved = schedules.filter((s) => !deletedIdSet.has(s.id));
      updatedTotalSchedules = [...preserved, ...newBlocks];
    } else {
      updatedTotalSchedules = [...schedules, ...newBlocks];
    }

    if (onBatchSaveSchedules) {
      onBatchSaveSchedules(updatedTotalSchedules, deletedIds, newBlocks);
    } else {
      deletedIds.forEach((id) => onDeleteScheduleBlock(id));
      newBlocks.forEach((b) => onSaveScheduleBlock(b));
    }

    setIsFullRoutineModalOpen(false);
    showToast(
      `✓ Rotina completa de ${selectedTurma} (${sourceBlocks.length} horários) replicada para ${fullRoutineTargetTurmas.length} turma(s)!`,
      'success'
    );
  };

  // --- REPLICATION 2: OPEN DAY REPLICATION MODAL ---
  const handleOpenDayReplicateModal = (day: DayOfWeek) => {
    const dayBlocks = schedulesByDay[day];
    if (dayBlocks.length === 0) {
      showToast(`Não há horários cadastrados em ${DAYS_OF_WEEK.find((d) => d.id === day)?.label} para replicar.`, 'error');
      return;
    }

    setDayReplicateModal({
      isOpen: true,
      sourceDay: day,
      sourceTurma: selectedTurma,
    });
    setDayReplicateMode('same_turma_other_days');
    // Default target days to other 4 days of the week
    setDayReplicateTargetDays(DAYS_OF_WEEK.filter((d) => d.id !== day).map((d) => d.id));
    // Default target turmas to current turma
    setDayReplicateTargetTurmas([selectedTurma]);
    setDayReplicateOverwrite(true);
  };

  // Quick switch modes for Day Replication
  const handleSetDayReplicateMode = (mode: 'same_turma_other_days' | 'other_turmas_same_day' | 'custom') => {
    if (!dayReplicateModal) return;
    setDayReplicateMode(mode);
    if (mode === 'same_turma_other_days') {
      setDayReplicateTargetDays(DAYS_OF_WEEK.filter((d) => d.id !== dayReplicateModal.sourceDay).map((d) => d.id));
      setDayReplicateTargetTurmas([dayReplicateModal.sourceTurma]);
    } else if (mode === 'other_turmas_same_day') {
      setDayReplicateTargetDays([dayReplicateModal.sourceDay]);
      setDayReplicateTargetTurmas(sortedTurmas.filter((t) => t !== dayReplicateModal.sourceTurma));
    } else {
      // Custom
      setDayReplicateTargetDays(DAYS_OF_WEEK.map((d) => d.id));
      setDayReplicateTargetTurmas(sortedTurmas);
    }
  };

  const handleToggleDayTargetDay = (day: DayOfWeek) => {
    if (dayReplicateTargetDays.includes(day)) {
      setDayReplicateTargetDays(dayReplicateTargetDays.filter((d) => d !== day));
    } else {
      setDayReplicateTargetDays([...dayReplicateTargetDays, day]);
    }
  };

  const handleToggleDayTargetTurma = (t: string) => {
    if (dayReplicateTargetTurmas.includes(t)) {
      setDayReplicateTargetTurmas(dayReplicateTargetTurmas.filter((item) => item !== t));
    } else {
      setDayReplicateTargetTurmas([...dayReplicateTargetTurmas, t]);
    }
  };

  // EXECUTE DAY REPLICATION
  const handleExecuteDayReplication = () => {
    if (!dayReplicateModal) return;
    const { sourceDay, sourceTurma } = dayReplicateModal;

    if (dayReplicateTargetTurmas.length === 0) {
      showToast('Selecione pelo menos uma turma de destino.', 'error');
      return;
    }
    if (dayReplicateTargetDays.length === 0) {
      showToast('Selecione pelo menos um dia da semana de destino.', 'error');
      return;
    }

    const sourceBlocks = schedules.filter((s) => s.turma === sourceTurma && s.dayOfWeek === sourceDay);
    if (sourceBlocks.length === 0) {
      showToast('Nenhum horário cadastrado no dia de origem.', 'error');
      return;
    }

    const newBlocks: ScheduleBlock[] = [];
    const deletedIds: string[] = [];

    // Targets to populate
    const targetPairs: { turma: string; day: DayOfWeek }[] = [];
    dayReplicateTargetTurmas.forEach((turma) => {
      dayReplicateTargetDays.forEach((day) => {
        // Avoid duplicating onto exactly the same source origin unless in custom mode
        if (turma === sourceTurma && day === sourceDay) {
          return;
        }
        targetPairs.push({ turma, day });
      });
    });

    if (targetPairs.length === 0) {
      showToast('Selecione um destino diferente do dia de origem.', 'error');
      return;
    }

    // If overwrite mode is chosen, find all existing blocks on each target (turma + day) to delete
    if (dayReplicateOverwrite) {
      targetPairs.forEach((pair) => {
        schedules.forEach((s) => {
          if (s.turma === pair.turma && s.dayOfWeek === pair.day) {
            deletedIds.push(s.id);
          }
        });
      });
    }

    // Generate new duplicated blocks for each target pair
    targetPairs.forEach((pair) => {
      sourceBlocks.forEach((src) => {
        const duplicated: ScheduleBlock = {
          id: `sch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          turma: pair.turma,
          dayOfWeek: pair.day,
          startTime: src.startTime,
          endTime: src.endTime,
          activityId: src.activityId,
          location: src.location || '',
          guidelines: src.guidelines || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newBlocks.push(duplicated);
      });
    });

    // Compute updated total schedules list
    let updatedTotalSchedules: ScheduleBlock[];
    if (dayReplicateOverwrite) {
      const deletedIdSet = new Set(deletedIds);
      const preserved = schedules.filter((s) => !deletedIdSet.has(s.id));
      updatedTotalSchedules = [...preserved, ...newBlocks];
    } else {
      updatedTotalSchedules = [...schedules, ...newBlocks];
    }

    if (onBatchSaveSchedules) {
      onBatchSaveSchedules(updatedTotalSchedules, deletedIds, newBlocks);
    } else {
      deletedIds.forEach((id) => onDeleteScheduleBlock(id));
      newBlocks.forEach((b) => onSaveScheduleBlock(b));
    }

    setDayReplicateModal(null);
    showToast(
      `✓ Horários de ${DAYS_OF_WEEK.find((d) => d.id === sourceDay)?.label} replicados com sucesso (${newBlocks.length} novos horários em ${targetPairs.length} destino(s))!`,
      'success'
    );
  };

  // Find Activity Details
  const getActivityDetails = (actId: string) => {
    return activitiesList.find((a) => a.id === actId);
  };

  // Calculate total blocks for a turma
  const totalBlocksForTurma = (t: TurmaType) => {
    return schedules.filter((s) => s.turma === t).length;
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center space-x-3 text-xs font-bold transition-all animate-bounce ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : 'bg-rose-950 text-rose-300 border-rose-800'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  Planejamento e Rotina
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {currentTurmaSchedules.length} blocos cadastrados para {selectedTurma}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
                Grade Horária Semanal
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Monte e organize os horários de Segunda a Sexta-feira para cada turma, com modalidades, salas e instruções.
              </p>
            </div>
          </div>

          {/* Top Actions: Exportar PDF, Replicar Rotina & Adicionar Horário */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenExportPdfModal}
              title="Exportar Grade Semanal ou Rotina Diária em PDF oficial"
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-xs sm:text-sm rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex items-center space-x-2"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Exportar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleOpenFullRoutineModal}
              title="Copiar toda a grade de Segunda a Sexta desta turma para outras turmas"
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs sm:text-sm rounded-2xl border border-indigo-200 shadow-xs transition-all cursor-pointer flex items-center space-x-2"
            >
              <Copy className="w-4 h-4 text-indigo-600" />
              <span>Replicar Rotina para Outras Turmas</span>
            </button>

            <button
              onClick={() => handleOpenNewBlock()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Horário na Grade</span>
            </button>
          </div>
        </div>

        {/* Turmas Selector Strip */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Selecione a Turma para Visualizar:
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {sortedTurmas.map((t) => {
              const isSelected = selectedTurma === t;
              const blockCount = totalBlocksForTurma(t);
              return (
                <button
                  key={t}
                  id={`schedule-select-turma-${t.replace(/\s+/g, '-').toLowerCase()}`}
                  type="button"
                  onClick={() => setSelectedTurma(t)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <span>{t}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {blockCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Week Timetable Columns (Segunda a Sexta) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {DAYS_OF_WEEK.map((day) => {
          const dayBlocks = schedulesByDay[day.id];
          return (
            <div
              key={day.id}
              className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col min-h-[420px] transition-all hover:border-indigo-200"
            >
              {/* Day Header with [📋 Replicar Dia] and [+] */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-indigo-100">
                    {day.short}
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 leading-tight">
                      {day.label}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {dayBlocks.length} {dayBlocks.length === 1 ? 'atividade' : 'atividades'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  {/* [ 📋 Replicar Dia ] Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenDayReplicateModal(day.id)}
                    title={`Replicar horários de ${day.label} (${selectedTurma}) para outros dias ou turmas`}
                    className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                      dayBlocks.length > 0
                        ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 hover:border-indigo-300'
                        : 'bg-slate-50 text-slate-300 border-slate-100 hover:bg-slate-100 hover:text-slate-400'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {/* Add block button */}
                  <button
                    type="button"
                    onClick={() => handleOpenNewBlock(day.id)}
                    title={`Adicionar horário em ${day.label}`}
                    className="w-7 h-7 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Schedule Blocks for this Day */}
              <div className="space-y-3 flex-1 flex flex-col">
                {dayBlocks.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 text-center rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50/50">
                    <Clock className="w-6 h-6 text-slate-300 mb-1" />
                    <p className="text-[11px] font-bold text-slate-400">
                      Nenhum horário cadastrado
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => handleOpenNewBlock(day.id)}
                        className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                      >
                        + Cadastrar
                      </button>
                    </div>
                  </div>
                ) : (
                  dayBlocks.map((block) => {
                    const actDetails = getActivityDetails(block.activityId);
                    const isRollCall = actDetails?.requiresRollCall !== false;

                    return (
                      <div
                        key={block.id}
                        className="group relative bg-slate-50 hover:bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-2.5"
                      >
                        {/* Time & Type Pill */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center space-x-1.5 bg-slate-900 text-white px-2 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wide">
                            <Clock className="w-3 h-3 text-indigo-400" />
                            <span>
                              {block.startTime} - {block.endTime}
                            </span>
                          </div>

                          {isRollCall ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Chamada
                            </span>
                          ) : (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                              Rotina
                            </span>
                          )}
                        </div>

                        {/* Activity Badge */}
                        <div>
                          <ActivityBadge
                            activity={block.activityId}
                            iconName={actDetails?.icon}
                            size="sm"
                          />
                        </div>

                        {/* Location (Optional) */}
                        {block.location && (
                          <div className="flex items-center space-x-1.5 text-[11px] text-slate-600 font-semibold bg-white/80 px-2 py-1 rounded-lg border border-slate-100">
                            <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="truncate">{block.location}</span>
                          </div>
                        )}

                        {/* Guidelines (Optional) */}
                        {block.guidelines && (
                          <div className="text-[11px] text-slate-600 bg-amber-50/70 border border-amber-200/60 rounded-xl p-2 font-medium leading-tight">
                            <div className="flex items-center space-x-1 text-[9px] font-extrabold uppercase text-amber-800 mb-0.5">
                              <Info className="w-2.5 h-2.5" />
                              <span>Orientações:</span>
                            </div>
                            <p className="line-clamp-2">{block.guidelines}</p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end space-x-1 pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleOpenEditBlock(block)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Editar este horário"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBlockToDelete(block)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir este horário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: REPLICAR ROTINA COMPLETA (ENTRE TURMAS) */}
      {/* ========================================================================= */}
      {isFullRoutineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">
                    Replicar Rotina Completa da Turma
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Copiar toda a grade semanal (Segunda a Sexta) de <strong className="text-white underline">{selectedTurma}</strong> para outras turmas.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFullRoutineModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Origin Overview Box */}
              <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-indigo-800 tracking-wider block">
                    Turma de Origem:
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {selectedTurma}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-800 tracking-wider block">
                    Total de Horários:
                  </span>
                  <span className="text-sm font-black text-indigo-600">
                    {currentTurmaSchedules.length} blocos na semana
                  </span>
                </div>
              </div>

              {/* Target Turmas Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Selecione as Turmas de Destino:
                  </label>
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllFullRoutineTurmas}
                      className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                    >
                      Marcar Todas
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllFullRoutineTurmas}
                      className="text-slate-500 hover:text-slate-700 font-bold hover:underline cursor-pointer"
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
                  {sortedTurmas
                    .filter((t) => t !== selectedTurma)
                    .map((t) => {
                      const isChecked = fullRoutineTargetTurmas.includes(t);
                      const existingCount = totalBlocksForTurma(t);
                      return (
                        <div
                          key={t}
                          onClick={() => handleToggleFullRoutineTurma(t)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            isChecked
                              ? 'bg-indigo-50/70 border-indigo-300 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                            <span className="text-xs font-bold text-slate-800">{t}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-100">
                            {existingCount} {existingCount === 1 ? 'horário' : 'horários'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Overwrite vs Keep Existing Mode */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
                  Modo de Gravação / Substituição:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    onClick={() => setFullRoutineOverwrite(true)}
                    className={`p-3.5 rounded-2xl border cursor-pointer flex items-start space-x-3 transition-all ${
                      fullRoutineOverwrite
                        ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="full_overwrite_mode"
                      checked={fullRoutineOverwrite}
                      onChange={() => setFullRoutineOverwrite(true)}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block">
                        Sobrescrever grade existente
                      </span>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                        Substitui completamente os horários das turmas selecionadas pelos horários de {selectedTurma}.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => setFullRoutineOverwrite(false)}
                    className={`p-3.5 rounded-2xl border cursor-pointer flex items-start space-x-3 transition-all ${
                      !fullRoutineOverwrite
                        ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="full_overwrite_mode"
                      checked={!fullRoutineOverwrite}
                      onChange={() => setFullRoutineOverwrite(false)}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block">
                        Manter existentes e adicionar
                      </span>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                        Preserva o que as turmas de destino já possuem e acrescenta novos blocos.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Summary Box */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Serão criados{' '}
                    <strong className="text-emerald-400">
                      {currentTurmaSchedules.length * fullRoutineTargetTurmas.length}
                    </strong>{' '}
                    novos blocos de horário para{' '}
                    <strong className="text-indigo-300">
                      {fullRoutineTargetTurmas.length}
                    </strong>{' '}
                    turma(s).
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsFullRoutineModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={fullRoutineTargetTurmas.length === 0}
                onClick={handleExecuteFullRoutineReplication}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center space-x-2"
              >
                <Copy className="w-4 h-4" />
                <span>Replicar Rotina Completa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REPLICAR DIA ESPECÍFICO (MESMA TURMA OU OUTRAS TURMAS) */}
      {/* ========================================================================= */}
      {dayReplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">
                    Replicar Horários de {DAYS_OF_WEEK.find((d) => d.id === dayReplicateModal.sourceDay)?.label}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Origem: <strong className="text-white">{dayReplicateModal.sourceTurma}</strong> ({schedulesByDay[dayReplicateModal.sourceDay].length} horários cadastrados).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDayReplicateModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Quick Strategy Preset Switcher */}
              <div>
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-2">
                  Escolha o Objetivo da Replicação:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetDayReplicateMode('same_turma_other_days')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      dayReplicateMode === 'same_turma_other_days'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-xs ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-extrabold block">1. Outros Dias</span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Copiar {DAYS_OF_WEEK.find((d) => d.id === dayReplicateModal.sourceDay)?.short} para outros dias de {dayReplicateModal.sourceTurma}.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetDayReplicateMode('other_turmas_same_day')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      dayReplicateMode === 'other_turmas_same_day'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-xs ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-extrabold block">2. Outras Turmas</span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Copiar {DAYS_OF_WEEK.find((d) => d.id === dayReplicateModal.sourceDay)?.short} para outras turmas no mesmo dia.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetDayReplicateMode('custom')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      dayReplicateMode === 'custom'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-xs ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-extrabold block">3. Personalizado</span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Escolher livremente turmas e dias de destino.
                    </span>
                  </button>
                </div>
              </div>

              {/* 1. Target Days Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Dias da Semana de Destino:
                  </label>
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setDayReplicateTargetDays(DAYS_OF_WEEK.map((d) => d.id))}
                      className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                    >
                      Todos os Dias
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {DAYS_OF_WEEK.map((d) => {
                    const isSource = d.id === dayReplicateModal.sourceDay;
                    const isChecked = dayReplicateTargetDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleToggleDayTargetDay(d.id)}
                        className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                          isChecked
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-[10px] font-extrabold uppercase">{d.short}</span>
                        <span className="text-[11px] truncate">{d.label.split('-')[0]}</span>
                        {isSource && (
                          <span
                            className={`text-[8px] font-extrabold px-1 rounded-sm mt-0.5 ${
                              isChecked ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            Origem
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Target Turmas Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Turmas de Destino:
                  </label>
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setDayReplicateTargetTurmas(sortedTurmas)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                    >
                      Todas as Turmas
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setDayReplicateTargetTurmas([dayReplicateModal.sourceTurma])}
                      className="text-slate-500 hover:text-slate-700 font-bold hover:underline cursor-pointer"
                    >
                      Apenas {dayReplicateModal.sourceTurma}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1">
                  {sortedTurmas.map((t) => {
                    const isChecked = dayReplicateTargetTurmas.includes(t);
                    const isSourceTurma = t === dayReplicateModal.sourceTurma;
                    return (
                      <div
                        key={t}
                        onClick={() => handleToggleDayTargetTurma(t)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? 'bg-indigo-50/80 border-indigo-300 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                          <span className="text-xs font-bold text-slate-800 truncate">{t}</span>
                        </div>
                        {isSourceTurma && (
                          <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-md shrink-0">
                            Origem
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Overwrite vs Keep Existing Mode */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
                  Modo de Gravação nos Destinos:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    onClick={() => setDayReplicateOverwrite(true)}
                    className={`p-3.5 rounded-2xl border cursor-pointer flex items-start space-x-3 transition-all ${
                      dayReplicateOverwrite
                        ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="day_overwrite_mode"
                      checked={dayReplicateOverwrite}
                      onChange={() => setDayReplicateOverwrite(true)}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block">
                        Sobrescrever horários existentes
                      </span>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                        Substitui os horários já existentes nos dias e turmas destino.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => setDayReplicateOverwrite(false)}
                    className={`p-3.5 rounded-2xl border cursor-pointer flex items-start space-x-3 transition-all ${
                      !dayReplicateOverwrite
                        ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-400'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="day_overwrite_mode"
                      checked={!dayReplicateOverwrite}
                      onChange={() => setDayReplicateOverwrite(false)}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 block">
                        Manter existentes e adicionar
                      </span>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                        Acrescenta os horários sem apagar os blocos atuais do destino.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Summary Box */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Serão gerados horários em{' '}
                    <strong className="text-emerald-400">
                      {dayReplicateTargetDays.length} dia(s)
                    </strong>{' '}
                    ×{' '}
                    <strong className="text-indigo-300">
                      {dayReplicateTargetTurmas.length} turma(s)
                    </strong>
                    .
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDayReplicateModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={dayReplicateTargetTurmas.length === 0 || dayReplicateTargetDays.length === 0}
                onClick={handleExecuteDayReplication}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center space-x-2"
              >
                <Copy className="w-4 h-4" />
                <span>Replicar Horários do Dia</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CADASTRO / EDIÇÃO DE BLOCO INDIVIDUAL */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                    {editingBlock ? 'Editar Horário da Grade' : 'Novo Horário na Grade'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Defina o dia, horário, modalidade e orientações para a turma.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Turma */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Turma:
                </label>
                <select
                  value={formTurma}
                  onChange={(e) => setFormTurma(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {sortedTurmas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Dia da Semana */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Dia da Semana:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DAYS_OF_WEEK.map((d) => {
                    const isSelected = formDayOfWeek === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setFormDayOfWeek(d.id)}
                        className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex flex-col items-center justify-center border ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-[10px] opacity-75">{d.short}</span>
                        <span className="text-[11px] truncate">{d.label.split('-')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Horário de Início e Término */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Horário da Atividade:
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Início:</span>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Término:</span>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Dynamic Chips: Horários Lançados na Turma */}
                <div className="mt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Horários Lançados na Turma:</span>
                    </span>
                    {registeredTurmaTimeSlots.length > 0 && (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                        {registeredTurmaTimeSlots.length} salvo{registeredTurmaTimeSlots.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {registeredTurmaTimeSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                      {registeredTurmaTimeSlots.map((slot, idx) => {
                        const isCurrentActive =
                          formStartTime === slot.startTime &&
                          formEndTime === slot.endTime &&
                          formActivityId === slot.activityId;
                        const daysLabels = Array.from(slot.days)
                          .map((d) => DAYS_OF_WEEK.find((dw) => dw.id === d)?.short || d)
                          .join(', ');

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setFormStartTime(slot.startTime);
                              setFormEndTime(slot.endTime);
                              setFormActivityId(slot.activityId);
                              if (slot.location && !formLocation) {
                                setFormLocation(slot.location);
                              }
                              if (slot.guidelines && !formGuidelines) {
                                setFormGuidelines(slot.guidelines);
                              }
                              setFormError(null);
                            }}
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 ${
                              isCurrentActive
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-500/20'
                                : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 border-slate-200 hover:border-indigo-300'
                            }`}
                            title={`Clique para preencher: ${slot.startTime} - ${slot.endTime} • ${slot.activityName} (${daysLabels})`}
                          >
                            <span className={isCurrentActive ? 'text-white' : 'text-indigo-600'}>
                              {renderActivityIcon(slot.iconName, 'w-3.5 h-3.5')}
                            </span>
                            <span>{slot.startTime} - {slot.endTime}</span>
                            <span className={isCurrentActive ? 'text-indigo-200' : 'text-slate-300'}>•</span>
                            <span className={`truncate max-w-[140px] ${isCurrentActive ? 'text-white font-extrabold' : 'text-slate-800'}`}>
                              {slot.activityName}
                            </span>
                            {isCurrentActive && <Check className="w-3 h-3 text-white ml-0.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded-xl p-2 text-center">
                      Nenhum horário cadastrado nesta turma ainda. Digite o início e término acima.
                    </p>
                  )}
                </div>
              </div>

              {/* 4. Atividade (Dropdown listando TODAS as cadastradas) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Atividade / Modalidade:
                </label>
                <select
                  value={formActivityId}
                  onChange={(e) => setFormActivityId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {activitiesList.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name} {act.requiresRollCall !== false ? '• (Exige Chamada)' : '• (Rotina / Grade)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Local / Sala (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Local / Sala (Opcional):
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Ex: Piscina Aquecida, Sala de Dança, Refeitório..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {COMMON_LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setFormLocation(loc)}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Orientações para a Monitora (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Orientações para a Monitora / Professor (Opcional):
                </label>
                <textarea
                  value={formGuidelines}
                  onChange={(e) => setFormGuidelines(e.target.value)}
                  rows={2}
                  placeholder="Ex: Conferir toucas antes de entrar na piscina; levar garrafas de água; separar material de leitura..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* 7. Replicar este bloco automaticamente (Seção Expansível / Seleção de Dias e Turmas) */}
              <div className="border border-indigo-200 bg-indigo-50/50 rounded-2xl p-4 space-y-3.5 transition-all">
                <div
                  onClick={() => setFormReplicationExpanded(!formReplicationExpanded)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                      <Copy className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-slate-900">
                          Replicar este bloco automaticamente
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Gravação em Lote
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Aplique esta mesma atividade para múltiplos dias e turmas em 1 clique.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormReplicationExpanded(!formReplicationExpanded);
                    }}
                    className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                      formReplicationExpanded
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                    }`}
                  >
                    {formReplicationExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {formReplicationExpanded && (
                  <div className="pt-3 border-t border-indigo-100 space-y-4 animate-in fade-in duration-150">
                    {/* A. Dias da Semana de Destino */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                        <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Dias da Semana:</span>
                        </label>
                        <div className="flex items-center space-x-2 text-[11px]">
                          <button
                            type="button"
                            onClick={handleSelectAllFormDays}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                          >
                            Seg a Sex
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={handleSelectMWFDays}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                          >
                            Seg/Qua/Sex
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={handleSelectTTSDays}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                          >
                            Ter/Qui
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {DAYS_OF_WEEK.map((d) => {
                          const isChecked = formReplicateDays.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => handleToggleFormReplicateDay(d.id)}
                              className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex flex-col items-center justify-center border ${
                                isChecked
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-500/20'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center space-x-1">
                                {isChecked && <Check className="w-3 h-3 text-white" />}
                                <span className="text-[10px]">{d.short}</span>
                              </div>
                              <span className="text-[11px] truncate">{d.label.split('-')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* B. Turmas de Destino */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                        <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Turmas de Destino:</span>
                        </label>
                        <div className="flex items-center space-x-2 text-[11px]">
                          <button
                            type="button"
                            onClick={handleSelectAllFormTurmas}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                          >
                            Todas ({sortedTurmas.length})
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={handleSelectInfantilFormTurmas}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                          >
                            Ed. Infantil
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={handleSelectFundamentalFormTurmas}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                          >
                            Fundamental
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1.5 bg-white rounded-xl border border-slate-200">
                        {sortedTurmas.map((t) => {
                          const isChecked = formReplicateTurmas.includes(t);
                          return (
                            <div
                              key={t}
                              onClick={() => handleToggleFormReplicateTurma(t)}
                              className={`p-2 rounded-lg border text-xs font-bold cursor-pointer transition-all flex items-center justify-between ${
                                isChecked
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-950 shadow-2xs'
                                  : 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center space-x-2">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                )}
                                <span className="truncate">{t}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* C. Resumo de Gravação em Lote */}
                    <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between text-xs shadow-sm">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          Serão gravados{' '}
                          <strong className="text-emerald-400">
                            {totalFormBlocksToGenerate} bloco(s)
                          </strong>{' '}
                          ({effectiveFormTargetDays.length} dia(s) × {effectiveFormTargetTurmas.length} turma(s)) no Firestore.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-500/20 transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {totalFormBlocksToGenerate > 1
                      ? `Salvar e Gravar ${totalFormBlocksToGenerate} Horários`
                      : editingBlock
                      ? 'Salvar Alterações'
                      : 'Salvar na Grade'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {isExportPdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Exportar Relatório em PDF
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Grade Horária e Rotina Diária Oficial • Colégio Crescer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportPdfModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Type of Report: Grade Semanal vs Rotina Diária */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Tipo de Relatório:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPdfReportType('weekly')}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      pdfReportType === 'weekly'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold">Grade Semanal</span>
                      <Calendar className="w-4 h-4 text-indigo-600" />
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Tabela horizontal com todos os horários de Segunda a Sexta-feira.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfReportType('daily')}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      pdfReportType === 'daily'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold">Rotina Diária</span>
                      <Clock className="w-4 h-4 text-indigo-600" />
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Cronograma detalhado do dia com orientações pedagógicas e locais.
                    </p>
                  </button>
                </div>
              </div>

              {/* Scope / Turma Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Turma Alvo:
                </label>
                <select
                  value={pdfTargetTurma}
                  onChange={(e) => setPdfTargetTurma(e.target.value as TurmaType | 'ALL')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {pdfReportType === 'weekly' && (
                    <option value="ALL">Todas as Turmas (Documento Unificado com todas as grades)</option>
                  )}
                  {sortedTurmas.map((t) => (
                    <option key={t} value={t}>
                      {t} ({totalBlocksForTurma(t)} horários cadastrados)
                    </option>
                  ))}
                </select>
              </div>

              {/* Day Selector (only for Daily Routine) */}
              {pdfReportType === 'daily' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Dia da Semana:
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {DAYS_OF_WEEK.map((d) => {
                      const isSelected = pdfTargetDay === d.id;
                      const targetTurmaName = pdfTargetTurma === 'ALL' ? selectedTurma : pdfTargetTurma;
                      const dayCount = schedules.filter((s) => s.turma === targetTurmaName && s.dayOfWeek === d.id).length;

                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setPdfTargetDay(d.id)}
                          className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 font-extrabold shadow-sm'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span className="block text-xs font-bold">{d.short}</span>
                          <span className={`block text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {dayCount} ativ.
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview Info Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-800">Layout Padrão Oficial do Colégio Crescer</p>
                  <p className="text-[11px] text-slate-500">
                    O PDF gerado conterá cabeçalho oficial, identificação do programa integral, carimbo de data/hora de emissão e paginação no rodapé.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setIsExportPdfModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteExportPdf}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Gerar e Baixar PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {blockToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Excluir Horário da Grade?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Deseja remover o horário de <strong>{blockToDelete.activityId}</strong> ({blockToDelete.startTime} - {blockToDelete.endTime}) da turma <strong>{blockToDelete.turma}</strong>?
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setBlockToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteBlock}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
