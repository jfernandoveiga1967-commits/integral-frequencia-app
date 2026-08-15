import { ActivityItem, TurmaType, Student } from '../types';

export const ACTIVITIES_LIST: ActivityItem[] = [
  { id: 'Rotina', name: 'Rotina', icon: 'Clock', description: 'Rotina diária e acompanhamento obrigatório de todos os alunos do Integral', defaultEquipment: 'Agenda escolar / Material de uso diário', requiresRollCall: true },
  { id: 'Natação', name: 'Natação', icon: 'Waves', description: 'Atividade aquática na piscina do Integral', defaultEquipment: 'Maiô/Sunga, Touca e Óculos', requiresRollCall: true },
  { id: 'Balé', name: 'Balé', icon: 'Sparkles', description: 'Expressão corporal e dança clássica', defaultEquipment: 'Colan, Sapatilha e Coque', requiresRollCall: true },
  { id: 'Dança', name: 'Dança', icon: 'Music', description: 'Ritmos e consciência corporal', defaultEquipment: 'Uniforme de Dança / Tênis', requiresRollCall: true },
  { id: 'Judô', name: 'Judô', icon: 'Award', description: 'Arte marcial e disciplina física', defaultEquipment: 'Kimono e Faixa', requiresRollCall: true },
  { id: 'Futebol', name: 'Futebol', icon: 'Trophy', description: 'Esporte coletivo no campo/quadra', defaultEquipment: 'Uniforme, Chuteira/Tênis e Meião', requiresRollCall: true },
  { id: 'Ginástica', name: 'Ginástica', icon: 'Activity', description: 'Ginástica artística e rítmica', defaultEquipment: 'Uniforme de Ginástica', requiresRollCall: true },
  { id: 'Flauta', name: 'Flauta', icon: 'Music2', description: 'Musicalização e prática de Flauta Doce', defaultEquipment: 'Flauta Doce e Pasta de Músicas', requiresRollCall: true },
];

export const TURMAS_LIST: TurmaType[] = [
  'Mini Maternal Azul',
  'Maternal Azul',
  'Infantil 1 Azul',
  'Infantil 2 Azul',
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
];

export const INITIAL_STUDENTS: Student[] = [];
