import { ActivityItem, ActivityType, TurmaType, Student, HolidayItem } from '../types';

export const OFFICIAL_ROLL_CALL_MODALITIES: ActivityType[] = [
  'Rotina',
  'Balé',
  'Dança',
  'Flauta',
  'Futebol',
  'Ginástica',
  'Judô',
  'Natação',
];

export const ACTIVITIES_LIST: ActivityItem[] = [
  { id: 'Acolhimento', name: 'Acolhimento', icon: 'HeartHandshake', description: 'Acolhimento, Roda de Conversa e integração dos alunos', defaultEquipment: 'Almofadas e agenda escolar', requiresRollCall: false },
  { id: 'Almoço', name: 'Almoço', icon: 'Utensils', description: 'Momento de refeição, hábitos nutricionais e autonomia', defaultEquipment: 'Kit de higiene bucal', requiresRollCall: false },
  { id: 'Artes', name: 'Artes', icon: 'Palette', description: 'Expressão plástica, pintura, modelagem e ateliê criativo', defaultEquipment: 'Avental de artes e materiais expressivos', requiresRollCall: false },
  { id: 'Balé', name: 'Balé', icon: 'Sparkles', description: 'Expressão corporal e dança clássica', defaultEquipment: 'Colan, Sapatilha e Coque', requiresRollCall: true },
  { id: 'Contação de Histórias', name: 'Contação de Histórias', icon: 'BookOpen', description: 'Literatura infantil, contação mediada e imaginação', defaultEquipment: 'Livro literário e fantoches', requiresRollCall: false },
  { id: 'Culinária', name: 'Culinária', icon: 'Utensils', description: 'Educação nutricional e culinária pedagógica', defaultEquipment: 'Touca e avental higiênico', requiresRollCall: false },
  { id: 'Dança', name: 'Dança', icon: 'Music', description: 'Ritmos, musicalidade e consciência corporal', defaultEquipment: 'Uniforme de Dança / Tênis', requiresRollCall: true },
  { id: 'Devocional', name: 'Devocional', icon: 'Heart', description: 'Momento devocional, formação de valores e espiritualidade', defaultEquipment: 'Bíblia infantil / Caderno de valores', requiresRollCall: false },
  { id: 'Flauta', name: 'Flauta', icon: 'Music2', description: 'Musicalização e prática de Flauta Doce', defaultEquipment: 'Flauta Doce e Pasta de Músicas', requiresRollCall: true },
  { id: 'Futebol', name: 'Futebol', icon: 'Trophy', description: 'Esporte coletivo no campo/quadra', defaultEquipment: 'Uniforme, Chuteira/Tênis e Meião', requiresRollCall: true },
  { id: 'Ginástica', name: 'Ginástica', icon: 'Activity', description: 'Ginástica artística e rítmica', defaultEquipment: 'Uniforme de Ginástica', requiresRollCall: true },
  { id: 'Judô', name: 'Judô', icon: 'Award', description: 'Arte marcial e disciplina física', defaultEquipment: 'Kimono e Faixa', requiresRollCall: true },
  { id: 'Musicalização', name: 'Musicalização', icon: 'Music', description: 'Educação musical, percussão e ritmo', defaultEquipment: 'Instrumentos musicais', requiresRollCall: false },
  { id: 'Natação', name: 'Natação', icon: 'Waves', description: 'Atividade aquática na piscina do Integral', defaultEquipment: 'Maiô/Sunga, Touca e Óculos', requiresRollCall: true },
  { id: 'Projeto', name: 'Projeto', icon: 'Sparkles', description: 'Projetos investigativos temáticos (3º ao 6º Ano)', defaultEquipment: 'Diário de bordo e material de pesquisa', requiresRollCall: false },
  { id: 'Robótica', name: 'Robótica', icon: 'Cpu', description: 'Robótica educacional, lógica e pensamento computacional', defaultEquipment: 'Kit de robótica / Tablets', requiresRollCall: false },
  { id: 'Rotina', name: 'Rotina', icon: 'Clock', description: 'Rotina diária e acompanhamento geral de todos os alunos do Integral', defaultEquipment: 'Agenda escolar / Material de uso diário', requiresRollCall: true },
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

export const INITIAL_HOLIDAYS: HolidayItem[] = [
  { id: 'hol_2026_01_01', date: '2026-01-01', name: 'Confraternização Universal', type: 'feriado', description: 'Feriado Nacional de Ano Novo' },
  { id: 'hol_2026_02_16', date: '2026-02-16', endDate: '2026-02-18', name: 'Recesso de Carnaval e Cinzas', type: 'recesso', description: 'Recesso Escolar de Carnaval e Quarta-feira de Cinzas' },
  { id: 'hol_2026_04_03', date: '2026-04-03', name: 'Sexta-feira Santa (Paixão de Cristo)', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_04_21', date: '2026-04-21', name: 'Tiradentes', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_05_01', date: '2026-05-01', name: 'Dia Mundial do Trabalho', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_06_04', date: '2026-06-04', endDate: '2026-06-05', name: 'Corpus Christi e Recesso Escolar', type: 'recesso', description: 'Feriado Municipal e Recesso Escolar' },
  { id: 'hol_2026_07_13', date: '2026-07-13', endDate: '2026-07-24', name: 'Recesso Escolar de Julho', type: 'recesso', description: 'Período Oficial de Recesso Escolar de Meio de Ano' },
  { id: 'hol_2026_09_07', date: '2026-09-07', name: 'Independência do Brasil', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_10_12', date: '2026-10-12', name: 'N. Sra. Aparecida / Dia das Crianças', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_10_15', date: '2026-10-15', name: 'Dia do Professor / Recesso Escolar', type: 'recesso', description: 'Comemoração ao Dia do Professor' },
  { id: 'hol_2026_11_02', date: '2026-11-02', name: 'Finados', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_11_15', date: '2026-11-15', name: 'Proclamação da República', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_11_20', date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra', type: 'feriado', description: 'Feriado Nacional' },
  { id: 'hol_2026_12_21', date: '2026-12-21', endDate: '2026-12-31', name: 'Recesso Escolar de Fim de Ano', type: 'recesso', description: 'Recesso Escolar e Feriados de Fim de Ano' },
];

