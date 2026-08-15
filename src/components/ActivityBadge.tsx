import React from 'react';
import { ActivityType } from '../types';
import {
  Waves,
  Sparkles,
  Music,
  Award,
  Trophy,
  Activity,
  Music2,
  BookOpen,
  Cpu,
  Palette,
  Dumbbell,
  Gamepad2,
  Layers,
  Clock,
  Utensils,
  Coffee,
  BookMarked,
  Sun,
  Smile,
} from 'lucide-react';

interface ActivityBadgeProps {
  activity: ActivityType;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconName?: string;
  customEquipment?: string;
}

export const activityConfig: Record<
  string,
  { name: string; bg: string; border: string; text: string; badgeBg: string; icon: React.ReactNode; equipmentHint: string }
> = {
  Rotina: {
    name: 'Rotina',
    bg: 'bg-rose-50 hover:bg-rose-100',
    border: 'border-rose-200',
    text: 'text-rose-800',
    badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
    icon: <Clock className="w-4 h-4" />,
    equipmentHint: 'Agenda escolar, uniforme regular e material de uso diário',
  },
  'Almoço': {
    name: 'Almoço',
    bg: 'bg-amber-50 hover:bg-amber-100',
    border: 'border-amber-200',
    text: 'text-amber-800',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: <Utensils className="w-4 h-4" />,
    equipmentHint: 'Momento de refeição do Integral',
  },
  'Lanche': {
    name: 'Lanche',
    bg: 'bg-orange-50 hover:bg-orange-100',
    border: 'border-orange-200',
    text: 'text-orange-800',
    badgeBg: 'bg-orange-100 text-orange-900 border-orange-300',
    icon: <Coffee className="w-4 h-4" />,
    equipmentHint: 'Momento de lanche e hidratação',
  },
  'Lição de Casa': {
    name: 'Lição de Casa',
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-200',
    text: 'text-blue-800',
    badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
    icon: <BookMarked className="w-4 h-4" />,
    equipmentHint: 'Estojo, caderno de tarefas e material didático',
  },
  Natação: {
    name: 'Natação',
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: <Waves className="w-4 h-4" />,
    equipmentHint: 'Maiô, sunga, touca, óculos ou toalha',
  },
  Balé: {
    name: 'Balé',
    bg: 'bg-pink-50 hover:bg-pink-100',
    border: 'border-pink-200',
    text: 'text-pink-700',
    badgeBg: 'bg-pink-100 text-pink-800 border-pink-300',
    icon: <Sparkles className="w-4 h-4" />,
    equipmentHint: 'Colan, sapatilha, meia-calça ou coque',
  },
  Dança: {
    name: 'Dança',
    bg: 'bg-purple-50 hover:bg-purple-100',
    border: 'border-purple-200',
    text: 'text-purple-700',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: <Music className="w-4 h-4" />,
    equipmentHint: 'Uniforme de dança ou calçado apropriado',
  },
  Judô: {
    name: 'Judô',
    bg: 'bg-amber-50 hover:bg-amber-100',
    border: 'border-amber-200',
    text: 'text-amber-800',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: <Award className="w-4 h-4" />,
    equipmentHint: 'Kimono (vagui/calça) e faixa',
  },
  Futebol: {
    name: 'Futebol',
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: <Trophy className="w-4 h-4" />,
    equipmentHint: 'Uniforme de futebol, chuteira/tênis e meião',
  },
  Ginástica: {
    name: 'Ginástica',
    bg: 'bg-indigo-50 hover:bg-indigo-100',
    border: 'border-indigo-200',
    text: 'text-indigo-800',
    badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    icon: <Activity className="w-4 h-4" />,
    equipmentHint: 'Uniforme oficial de ginástica',
  },
  Flauta: {
    name: 'Flauta',
    bg: 'bg-teal-50 hover:bg-teal-100',
    border: 'border-teal-200',
    text: 'text-teal-800',
    badgeBg: 'bg-teal-100 text-teal-900 border-teal-300',
    icon: <Music2 className="w-4 h-4" />,
    equipmentHint: 'Flauta Doce e pasta de partituras/músicas',
  },
};

export function renderActivityIcon(iconName?: string, className: string = 'w-4 h-4') {
  switch (iconName) {
    case 'Clock':
      return <Clock className={className} />;
    case 'Waves':
      return <Waves className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Music':
      return <Music className={className} />;
    case 'Award':
      return <Award className={className} />;
    case 'Trophy':
      return <Trophy className={className} />;
    case 'Activity':
      return <Activity className={className} />;
    case 'Music2':
      return <Music2 className={className} />;
    case 'BookOpen':
      return <BookOpen className={className} />;
    case 'BookMarked':
      return <BookMarked className={className} />;
    case 'Utensils':
      return <Utensils className={className} />;
    case 'Coffee':
      return <Coffee className={className} />;
    case 'Sun':
      return <Sun className={className} />;
    case 'Smile':
      return <Smile className={className} />;
    case 'Cpu':
      return <Cpu className={className} />;
    case 'Palette':
      return <Palette className={className} />;
    case 'Dumbbell':
      return <Dumbbell className={className} />;
    case 'Gamepad2':
      return <Gamepad2 className={className} />;
    default:
      return <Layers className={className} />;
  }
}

export const ActivityBadge: React.FC<ActivityBadgeProps> = ({
  activity,
  showIcon = true,
  size = 'md',
  className = '',
  iconName,
  customEquipment,
}) => {
  const defaultConfig = activityConfig[activity];

  const config = defaultConfig || {
    name: activity,
    bg: 'bg-cyan-50 hover:bg-cyan-100',
    border: 'border-cyan-200',
    text: 'text-cyan-800',
    badgeBg: 'bg-cyan-100 text-cyan-900 border-cyan-300',
    icon: renderActivityIcon(iconName),
    equipmentHint: customEquipment || 'Material necessário para a atividade',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 space-x-1',
    md: 'text-sm px-2.5 py-1 space-x-1.5',
    lg: 'text-base px-3 py-1.5 space-x-2 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.badgeBg} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{activity}</span>
    </span>
  );
};
