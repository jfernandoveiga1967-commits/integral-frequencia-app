import { ActivityItem, TurmaType, Student } from '../types';

export const ACTIVITIES_LIST: ActivityItem[] = [
  { id: 'Natação', name: 'Natação', icon: 'Waves', description: 'Atividade aquática na piscina do Integral', defaultEquipment: 'Maiô/Sunga, Touca e Óculos' },
  { id: 'Balé', name: 'Balé', icon: 'Sparkles', description: 'Expressão corporal e dança clássica', defaultEquipment: 'Colan, Sapatilha e Coque' },
  { id: 'Dança', name: 'Dança', icon: 'Music', description: 'Ritmos e consciência corporal', defaultEquipment: 'Uniforme de Dança / Tênis' },
  { id: 'Judô', name: 'Judô', icon: 'Award', description: 'Arte marcial e disciplina física', defaultEquipment: 'Kimono e Faixa' },
  { id: 'Futebol', name: 'Futebol', icon: 'Trophy', description: 'Esporte coletivo no campo/quadra', defaultEquipment: 'Uniforme, Chuteira/Tênis e Meião' },
  { id: 'Ginástica', name: 'Ginástica', icon: 'Activity', description: 'Ginástica artística e rítmica', defaultEquipment: 'Uniforme de Ginástica' },
  { id: 'Flauta', name: 'Flauta', icon: 'Music2', description: 'Musicalização e prática de Flauta Doce', defaultEquipment: 'Flauta Doce e Pasta de Músicas' },
];

export const TURMAS_LIST: TurmaType[] = [
  '1º Ano Azul',
  '1º Ano Vermelho',
  '2º Ano Azul',
  '2º Ano Vermelho',
  '3º Ano Azul',
  '3º Ano Vermelho',
  '4º Ano Azul',
  '4º Ano Vermelho',
  '5º Ano Azul',
  '6º Ano Azul',
  'Infantil 1 Azul',
  'Infantil 2 Azul',
  'Maternal Azul',
  'Mini Maternal Azul',
];

export const INITIAL_STUDENTS: Student[] = [];
