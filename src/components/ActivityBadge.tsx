import React from 'react';
import { ActivityType, ActivityItem } from '../types';
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
  HeartHandshake,
  HandHeart,
  Heart,
  Globe,
  Camera,
  Feather,
  GraduationCap,
  ShieldCheck,
  Zap,
  Rocket,
  Scissors,
  Compass,
  Lightbulb,
  Languages,
  HeartPulse,
  Flame,
  Flag,
  Bike,
  Moon,
} from 'lucide-react';
import { processMarkdownAndIconsForPDF } from '../utils/markdownUtils';

interface ActivityBadgeProps {
  activity: ActivityType;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconName?: string;
  customIconUrl?: string;
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
  Acolhimento: {
    name: 'Acolhimento',
    bg: 'bg-rose-50 hover:bg-rose-100',
    border: 'border-rose-200',
    text: 'text-rose-800',
    badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
    icon: <HeartHandshake className="w-4 h-4" />,
    equipmentHint: 'Recepção, acolhida e integração dos alunos',
  },
  Soninho: {
    name: 'Soninho',
    bg: 'bg-indigo-50 hover:bg-indigo-100',
    border: 'border-indigo-200',
    text: 'text-indigo-800',
    badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    icon: <Moon className="w-4 h-4" />,
    equipmentHint: 'Momento de repouso, relaxamento e sono',
  },
  Sono: {
    name: 'Soninho',
    bg: 'bg-indigo-50 hover:bg-indigo-100',
    border: 'border-indigo-200',
    text: 'text-indigo-800',
    badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    icon: <Moon className="w-4 h-4" />,
    equipmentHint: 'Momento de repouso, relaxamento e sono',
  },
};

export const BASE_AVAILABLE_ICONS = [
  { id: 'HeartHandshake', label: 'Acolhimento / Integração' },
  { id: 'Moon', label: 'Soninho / Sono / Descanso' },
  { id: 'Waves', label: 'Natação / Piscina / Água' },
  { id: 'Sparkles', label: 'Balé / Brilho / Criativo' },
  { id: 'Music', label: 'Dança / Músicas / Ritmo' },
  { id: 'Award', label: 'Judô / Lutas / Artes Marciais' },
  { id: 'Trophy', label: 'Futebol / Esportes / Torneios' },
  { id: 'Activity', label: 'Ginástica / Fitness / Movimento' },
  { id: 'Music2', label: 'Instrumentos / Flauta / Canto' },
  { id: 'Gamepad2', label: 'Xadrez / Mente / Estratégia' },
  { id: 'Cpu', label: 'Robótica / Tech / Programação' },
  { id: 'Palette', label: 'Artes / Pintura / Ateliê' },
  { id: 'BookOpen', label: 'Teatro / Leitura / Literatura' },
  { id: 'Scissors', label: 'Artesanato / Costura / Modelagem' },
  { id: 'Clock', label: 'Rotina / Horários / Transição' },
  { id: 'Utensils', label: 'Almoço / Refeição / Culinária' },
  { id: 'Coffee', label: 'Lanche / Intervalo / Hidratação' },
  { id: 'BookMarked', label: 'Lição de Casa / Apoio Escolar' },
  { id: 'Sun', label: 'Parquinho / Pátio / Ar Livre' },
  { id: 'Smile', label: 'Recreação / Brincadeiras' },
];

// Helper to intelligently detect/assign a representative icon name based on activity title
export function detectIconFromActivityName(name: string): string {
  if (!name) return 'Sparkles';
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('soninho') || clean.includes('sono') || clean.includes('descans') || clean.includes('sonec') || clean.includes('repous')) {
    return 'Moon';
  }
  if (clean.includes('acolh') || clean.includes('recepc') || clean.includes('integrac') || clean.includes('boas vindas') || clean.includes('cuid') || clean.includes('afeto') || clean.includes('emocion') || clean.includes('socioemoc')) {
    return 'HeartHandshake';
  }
  if (clean.includes('natac') || clean.includes('piscina') || clean.includes('aqua') || clean.includes('hidro')) {
    return 'Waves';
  }
  if (clean.includes('bale') || clean.includes('ballet')) {
    return 'Sparkles';
  }
  if (clean.includes('danc') || clean.includes('ritmo') || clean.includes('zumba') || clean.includes('coreo')) {
    return 'Music';
  }
  if (clean.includes('flaut') || clean.includes('violao') || clean.includes('teclado') || clean.includes('piano') || clean.includes('canto') || clean.includes('coral') || clean.includes('musica') || clean.includes('banda')) {
    return 'Music2';
  }
  if (clean.includes('judo') || clean.includes('karate') || clean.includes('capoeira') || clean.includes('taekwondo') || clean.includes('luta') || clean.includes('artes marciais') || clean.includes('jiu')) {
    return 'Award';
  }
  if (clean.includes('futebol') || clean.includes('futsal') || clean.includes('gol') || clean.includes('society') || clean.includes('torneio') || clean.includes('basquete') || clean.includes('volei') || clean.includes('handebol') || clean.includes('atletismo') || clean.includes('esporte') || clean.includes('treino')) {
    return 'Trophy';
  }
  if (clean.includes('ginast') || clean.includes('fitness') || clean.includes('along') || clean.includes('movimento') || clean.includes('acrobac') || clean.includes('circo') || clean.includes('yoga') || clean.includes('psicomot')) {
    return 'Activity';
  }
  if (clean.includes('xadrez') || clean.includes('dama') || clean.includes('tabuleiro') || clean.includes('racioc') || clean.includes('game') || clean.includes('jogos de')) {
    return 'Gamepad2';
  }
  if (clean.includes('robot') || clean.includes('maker') || clean.includes('tech') || clean.includes('program') || clean.includes('stem') || clean.includes('comput') || clean.includes('lego') || clean.includes('cienc')) {
    return 'Cpu';
  }
  if (clean.includes('arte') || clean.includes('pint') || clean.includes('desenh') || clean.includes('escul') || clean.includes('argila') || clean.includes('aquarela') || clean.includes('atelie') || clean.includes('foto') || clean.includes('cinema')) {
    return 'Palette';
  }
  if (clean.includes('teatro') || clean.includes('dramatiz') || clean.includes('leitur') || clean.includes('livro') || clean.includes('contac') || clean.includes('literat') || clean.includes('ingles') || clean.includes('idiom') || clean.includes('biling')) {
    return 'BookOpen';
  }
  if (clean.includes('costur') || clean.includes('artesan') || clean.includes('modelag') || clean.includes('criativ') || clean.includes('oficina')) {
    return 'Scissors';
  }
  if (clean.includes('licao') || clean.includes('taref') || clean.includes('dever') || clean.includes('estudo') || clean.includes('reforco') || clean.includes('pedagog')) {
    return 'BookMarked';
  }
  if (clean.includes('almoc') || clean.includes('refeic') || clean.includes('culinar') || clean.includes('nutric') || clean.includes('comida')) {
    return 'Utensils';
  }
  if (clean.includes('lanche') || clean.includes('merend') || clean.includes('cafe') || clean.includes('hidrat')) {
    return 'Coffee';
  }
  if (clean.includes('parquinh') || clean.includes('patio') || clean.includes('ar livre') || clean.includes('horta') || clean.includes('naturez') || clean.includes('bike') || clean.includes('patin')) {
    return 'Sun';
  }
  if (clean.includes('recreac') || clean.includes('brincad') || clean.includes('gincan') || clean.includes('divers') || clean.includes('jogo')) {
    return 'Smile';
  }

  return 'Sparkles';
}

export function renderActivityIcon(iconName?: string, className: string = 'w-4 h-4') {
  switch (iconName) {
    case 'HeartHandshake':
      return <HeartHandshake className={className} />;
    case 'Moon':
      return <Moon className={className} />;
    case 'HandHeart':
      return <HandHeart className={className} />;
    case 'Heart':
      return <Heart className={className} />;
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
    case 'Globe':
      return <Globe className={className} />;
    case 'Languages':
      return <Languages className={className} />;
    case 'Lightbulb':
      return <Lightbulb className={className} />;
    case 'Rocket':
      return <Rocket className={className} />;
    case 'Camera':
      return <Camera className={className} />;
    case 'Scissors':
      return <Scissors className={className} />;
    case 'Feather':
      return <Feather className={className} />;
    case 'Compass':
      return <Compass className={className} />;
    case 'Zap':
      return <Zap className={className} />;
    case 'ShieldCheck':
      return <ShieldCheck className={className} />;
    case 'Bike':
      return <Bike className={className} />;
    case 'Flame':
      return <Flame className={className} />;
    case 'HeartPulse':
      return <HeartPulse className={className} />;
    case 'GraduationCap':
      return <GraduationCap className={className} />;
    case 'Flag':
      return <Flag className={className} />;
    default:
      return <Layers className={className} />;
  }
}

export function renderActivityIconOrImage(
  iconName?: string,
  customIconUrl?: string,
  className: string = 'w-4 h-4',
  altText: string = 'Ícone da Modalidade'
) {
  if (customIconUrl && customIconUrl.trim() !== '') {
    return (
      <img
        src={customIconUrl}
        alt={altText}
        className={`${className} object-contain rounded-xs shrink-0 inline-block`}
        onError={(e) => {
          // If image fails, hide image element so fallback can render or container stays clean
          (e.currentTarget as HTMLElement).style.display = 'none';
        }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return renderActivityIcon(iconName, className);
}

export const ActivityBadge: React.FC<ActivityBadgeProps> = ({
  activity,
  showIcon = true,
  size = 'md',
  className = '',
  iconName,
  customIconUrl,
  customEquipment,
}) => {
  const defaultConfig = activityConfig[activity];

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 space-x-1',
    md: 'text-sm px-2.5 py-1 space-x-1.5',
    lg: 'text-base px-3 py-1.5 space-x-2 font-medium',
  };

  const iconSizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const resolvedIconName = iconName || detectIconFromActivityName(activity);

  const iconNode = customIconUrl && customIconUrl.trim() !== '' ? (
    <img
      src={customIconUrl}
      alt={activity}
      className={`${iconSizeClasses[size]} object-contain rounded-xs shrink-0 inline-block`}
      onError={(e) => {
        // Fallback: replace with default Lucide icon on image error
        (e.currentTarget as HTMLElement).style.display = 'none';
      }}
      referrerPolicy="no-referrer"
    />
  ) : (
    defaultConfig?.icon || renderActivityIcon(resolvedIconName, iconSizeClasses[size])
  );

  const config = defaultConfig || {
    name: activity,
    bg: 'bg-cyan-50 hover:bg-cyan-100',
    border: 'border-cyan-200',
    text: 'text-cyan-800',
    badgeBg: 'bg-cyan-100 text-cyan-900 border-cyan-300',
    icon: iconNode,
    equipmentHint: customEquipment || 'Material necessário para a atividade',
  };

  const cleanLabel = processMarkdownAndIconsForPDF(activity)
    .replace(/^(\p{Extended_Pictographic}|[⭐🤝🌙🍽️🥪☕💧🏊🩰💃🥋⚽🏆🤸🎪🎵♟️🎲🤖🎨✂️🎭📖📝🧼🚿🪥🌳🎈⏰])\s*/u, '')
    .trim() || activity;

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.badgeBg} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <span className="flex items-center justify-center shrink-0">{iconNode}</span>}
      <span className="truncate">{cleanLabel}</span>
    </span>
  );
};
