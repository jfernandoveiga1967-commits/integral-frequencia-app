import { ActivityType, TurmaType, Student } from '../types';

export const ACTIVITIES_LIST: { id: ActivityType; name: string; icon: string; description: string; defaultEquipment: string }[] = [
  { id: 'Natação', name: 'Natação', icon: 'Waves', description: 'Atividade aquática na piscina do Integral', defaultEquipment: 'Maiô/Sunga, Touca e Óculos' },
  { id: 'Balé', name: 'Balé', icon: 'Sparkles', description: 'Expressão corporal e dança clássica', defaultEquipment: 'Colan, Sapatilha e Coque' },
  { id: 'Dança', name: 'Dança', icon: 'Music', description: 'Ritmos e consciência corporal', defaultEquipment: 'Uniforme de Dança / Tênis' },
  { id: 'Judô', name: 'Judô', icon: 'Award', description: 'Arte marcial e disciplina física', defaultEquipment: 'Kimono e Faixa' },
  { id: 'Futebol', name: 'Futebol', icon: 'Trophy', description: 'Esporte coletivo no campo/quadra', defaultEquipment: 'Uniforme, Chuteira/Tênis e Meião' },
  { id: 'Ginástica', name: 'Ginástica', icon: 'Activity', description: 'Ginástica artística e rítmica', defaultEquipment: 'Uniforme de Ginástica' },
  { id: 'Flauta', name: 'Flauta', icon: 'Music2', description: 'Musicalização e prática de Flauta Doce', defaultEquipment: 'Flauta Doce e Pasta de Músicas' },
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

export const INITIAL_STUDENTS: Student[] = [
  // Mini Maternal Azul
  { id: 'st-1', name: 'Alice Martins', turma: 'Mini Maternal Azul', activities: ['Natação', 'Balé', 'Flauta'] },
  // Maternal Azul
  { id: 'st-2', name: 'Bernardo Silva', turma: 'Maternal Azul', activities: ['Judô', 'Natação'] },
  // Infantil 1 Azul
  { id: 'st-3', name: 'Gael Oliveira', turma: 'Infantil 1 Azul', activities: ['Natação', 'Dança'] },
  { id: 'st-4', name: 'Helena Costa', turma: 'Infantil 1 Azul', activities: ['Balé', 'Flauta'] },

  // Infantil 2 Azul
  { id: 'st-5', name: 'Arthur Souza', turma: 'Infantil 2 Azul', activities: ['Futebol', 'Judô', 'Natação'] },
  { id: 'st-6', name: 'Laura Ferreira', turma: 'Infantil 2 Azul', activities: ['Balé', 'Ginástica', 'Flauta'] },
  { id: 'st-7', name: 'Lucas Pereira', turma: 'Infantil 2 Azul', activities: ['Futebol', 'Natação'] },
  { id: 'st-8', name: 'Manuela Lima', turma: 'Infantil 2 Azul', activities: ['Dança', 'Flauta', 'Ginástica'] },

  // 1º Ano Azul
  { id: 'st-9', name: 'Gabriel Santos', turma: '1º Ano Azul', activities: ['Judô', 'Futebol', 'Flauta'] },
  { id: 'st-10', name: 'Sophia Rodrigues', turma: '1º Ano Azul', activities: ['Balé', 'Natação', 'Flauta'] },
  { id: 'st-11', name: 'Matheus Almeida', turma: '1º Ano Azul', activities: ['Futebol', 'Judô'] },
  { id: 'st-12', name: 'Isabella Gomes', turma: '1º Ano Azul', activities: ['Ginástica', 'Dança', 'Flauta'] },

  // 1º Ano Vermelho
  { id: 'st-13', name: 'Enzo Ribeiro', turma: '1º Ano Vermelho', activities: ['Futebol', 'Natação'] },
  { id: 'st-14', name: 'Valentina Carvalho', turma: '1º Ano Vermelho', activities: ['Balé', 'Flauta'] },
  { id: 'st-15', name: 'Pedro Henrique', turma: '1º Ano Vermelho', activities: ['Judô', 'Flauta'] },

  // 2º Ano Azul
  { id: 'st-16', name: 'Davi Lucca', turma: '2º Ano Azul', activities: ['Futebol', 'Judô', 'Natação'] },
  { id: 'st-17', name: 'Giovanna Rocha', turma: '2º Ano Azul', activities: ['Balé', 'Flauta', 'Ginástica'] },
  { id: 'st-18', name: 'Felipe Mendes', turma: '2º Ano Azul', activities: ['Futebol', 'Flauta'] },

  // 2º Ano Vermelho
  { id: 'st-19', name: 'Maria Eduarda', turma: '2º Ano Vermelho', activities: ['Dança', 'Flauta', 'Natação'] },
  { id: 'st-20', name: 'Rafael Dias', turma: '2º Ano Vermelho', activities: ['Judô', 'Futebol'] },

  // 3º Ano Azul
  { id: 'st-21', name: 'Nicolas Barbosa', turma: '3º Ano Azul', activities: ['Natação', 'Futebol', 'Flauta'] },
  { id: 'st-22', name: 'Beatriz Cardoso', turma: '3º Ano Azul', activities: ['Ginástica', 'Balé', 'Flauta'] },

  // 3º Ano Vermelho
  { id: 'st-23', name: 'Samuel Teixeira', turma: '3º Ano Vermelho', activities: ['Futebol', 'Judô', 'Flauta'] },
  { id: 'st-24', name: 'Lívia Fernandes', turma: '3º Ano Vermelho', activities: ['Dança', 'Flauta'] },

  // 4º Ano Azul
  { id: 'st-25', name: 'Daniel Castro', turma: '4º Ano Azul', activities: ['Natação', 'Futebol', 'Flauta'] },
  { id: 'st-26', name: 'Mariana Duarte', turma: '4º Ano Azul', activities: ['Ginástica', 'Flauta'] },

  // 4º Ano Vermelho
  { id: 'st-27', name: 'Guilherme Moreira', turma: '4º Ano Vermelho', activities: ['Judô', 'Futebol'] },
  { id: 'st-28', name: 'Lorena Nunes', turma: '4º Ano Vermelho', activities: ['Balé', 'Flauta'] },

  // 5º Ano Azul
  { id: 'st-29', name: 'Thiago Farias', turma: '5º Ano Azul', activities: ['Futebol', 'Natação', 'Flauta'] },
  { id: 'st-30', name: 'Camila Barros', turma: '5º Ano Azul', activities: ['Dança', 'Flauta', 'Ginástica'] },

  // 6º Ano Azul
  { id: 'st-31', name: 'Vinícius Monteiro', turma: '6º Ano Azul', activities: ['Futebol', 'Judô', 'Flauta'] },
  { id: 'st-32', name: 'Julia Martins', turma: '6º Ano Azul', activities: ['Ginástica', 'Flauta'] },
];
