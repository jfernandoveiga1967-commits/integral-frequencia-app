import React from 'react';
import { AttendanceStatus } from '../types';
import { CheckCircle2, XCircle, Stethoscope, Shirt } from 'lucide-react';

interface StatusBadgeProps {
  status: AttendanceStatus;
  equipmentDetails?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const statusConfig: Record<
  AttendanceStatus,
  { label: string; shortLabel: string; bg: string; text: string; border: string; activeBg: string; icon: React.ReactNode }
> = {
  presente: {
    label: 'Presença Confirmada',
    shortLabel: 'Presente',
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    activeBg: 'bg-emerald-600 text-white border-emerald-700',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  falta: {
    label: 'Ausência por Falta',
    shortLabel: 'Falta',
    bg: 'bg-rose-50 text-rose-800 border-rose-200',
    text: 'text-rose-700',
    border: 'border-rose-300',
    activeBg: 'bg-rose-600 text-white border-rose-700',
    icon: <XCircle className="w-4 h-4" />,
  },
  saude: {
    label: 'Ausência por Saúde',
    shortLabel: 'Saúde',
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    text: 'text-amber-800',
    border: 'border-amber-300',
    activeBg: 'bg-amber-500 text-white border-amber-600',
    icon: <Stethoscope className="w-4 h-4" />,
  },
  sem_equipamento: {
    label: 'Falta de Equipamento / Uniforme / Flauta',
    shortLabel: 'Sem Equipamento',
    bg: 'bg-orange-50 text-orange-900 border-orange-200',
    text: 'text-orange-800',
    border: 'border-orange-300',
    activeBg: 'bg-orange-600 text-white border-orange-700',
    icon: <Shirt className="w-4 h-4" />,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  equipmentDetails,
  size = 'md',
  className = '',
}) => {
  const config = statusConfig[status];

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 space-x-1',
    md: 'text-xs md:text-sm px-2.5 py-1 space-x-1.5',
    lg: 'text-sm md:text-base px-3 py-1.5 space-x-2 font-medium',
  };

  return (
    <div className="inline-flex flex-col">
      <span
        className={`inline-flex items-center rounded-md border font-medium ${config.bg} ${sizeClasses[size]} ${className}`}
      >
        <span>{config.icon}</span>
        <span>{config.shortLabel}</span>
      </span>
      {status === 'sem_equipamento' && equipmentDetails && (
        <span className="text-[11px] text-orange-800 font-medium mt-0.5 italic max-w-xs truncate">
          ⚠️ {equipmentDetails}
        </span>
      )}
    </div>
  );
};
