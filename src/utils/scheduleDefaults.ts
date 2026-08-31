import { ScheduleBlock, TurmaType, DayOfWeek } from '../types';
import { TURMAS_LIST } from '../data/initialData';

export interface TurmaScheduleTemplate {
  turma: TurmaType;
  schedule: Record<DayOfWeek, Array<{ activity: string; startTime: string; endTime: string; location?: string }>>;
}

/**
 * Matriz Curricular e Grade Horária Oficial por Turma (Integral)
 */
export const OFFICIAL_SCHEDULE_TEMPLATES: Record<string, Record<DayOfWeek, Array<{ activity: string; startTime: string; endTime: string; location?: string }>>> = {
  'Mini Maternal Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala do Mini' },
      { activity: 'Estimulação Psicomotora', startTime: '13:40', endTime: '14:30', location: 'Espaço Psicomotor' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Infantil' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala do Mini' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:30', location: 'Sala de Dança' },
      { activity: 'Contação de Histórias', startTime: '15:00', endTime: '15:50', location: 'Biblioteca Infantil' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala do Mini' },
      { activity: 'Artes', startTime: '13:40', endTime: '14:30', location: 'Ateliê Criativo' },
      { activity: 'Recreação Dirigida', startTime: '15:00', endTime: '15:50', location: 'Parquinho' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala do Mini' },
      { activity: 'Musicalização', startTime: '13:40', endTime: '14:30', location: 'Sala de Música' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala do Mini' },
      { activity: 'Jogos de Tabuleiro', startTime: '13:40', endTime: '14:30', location: 'Sala do Mini' },
      { activity: 'Relaxamento', startTime: '15:00', endTime: '15:50', location: 'Sala de Descanso' },
    ],
  },
  'Maternal Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Maternal' },
      { activity: 'Estimulação Psicomotora', startTime: '13:40', endTime: '14:30', location: 'Espaço Psicomotor' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Infantil' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala Maternal' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:30', location: 'Sala de Dança' },
      { activity: 'Contação de Histórias', startTime: '15:00', endTime: '15:50', location: 'Biblioteca Infantil' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Maternal' },
      { activity: 'Artes', startTime: '13:40', endTime: '14:30', location: 'Ateliê Criativo' },
      { activity: 'Recreação Dirigida', startTime: '15:00', endTime: '15:50', location: 'Parquinho' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala Maternal' },
      { activity: 'Musicalização', startTime: '13:40', endTime: '14:30', location: 'Sala de Música' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Maternal' },
      { activity: 'Jogos de Tabuleiro', startTime: '13:40', endTime: '14:30', location: 'Sala Maternal' },
      { activity: 'Relaxamento', startTime: '15:00', endTime: '15:50', location: 'Sala de Descanso' },
    ],
  },
  'Infantil 1 Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 1' },
      { activity: 'Estimulação Psicomotora', startTime: '13:40', endTime: '14:30', location: 'Espaço Psicomotor' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Infantil' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 1' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:30', location: 'Sala de Dança' },
      { activity: 'Contação de Histórias', startTime: '15:00', endTime: '15:50', location: 'Biblioteca Infantil' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 1' },
      { activity: 'Artes', startTime: '13:40', endTime: '14:30', location: 'Ateliê Criativo' },
      { activity: 'Recreação Dirigida', startTime: '15:00', endTime: '15:50', location: 'Parquinho' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 1' },
      { activity: 'Musicalização', startTime: '13:40', endTime: '14:30', location: 'Sala de Música' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 1' },
      { activity: 'Jogos de Tabuleiro', startTime: '13:40', endTime: '14:30', location: 'Sala Infantil 1' },
      { activity: 'Relaxamento', startTime: '15:00', endTime: '15:50', location: 'Sala de Descanso' },
    ],
  },
  'Infantil 2 Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 2' },
      { activity: 'Estimulação Psicomotora', startTime: '13:40', endTime: '14:30', location: 'Espaço Psicomotor' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Infantil' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 2' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:30', location: 'Sala de Dança' },
      { activity: 'Contação de Histórias', startTime: '15:00', endTime: '15:50', location: 'Biblioteca Infantil' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 2' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:30', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê Criativo' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 2' },
      { activity: 'Musicalização', startTime: '13:40', endTime: '14:30', location: 'Sala de Música' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala Infantil 2' },
      { activity: 'Jogos de Tabuleiro', startTime: '13:40', endTime: '14:30', location: 'Sala Infantil 2' },
      { activity: 'Relaxamento', startTime: '15:00', endTime: '15:50', location: 'Sala de Descanso' },
    ],
  },
  '1º Ano Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Ano' },
      { activity: 'Natação', startTime: '13:40', endTime: '14:40', location: 'Piscina Grande' },
      { activity: 'Estimulação Psicomotora', startTime: '15:00', endTime: '15:50', location: 'Quadra Coberta' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Ano' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Contação de Histórias', startTime: '15:00', endTime: '15:50', location: 'Biblioteca' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Ano' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Ano' },
      { activity: 'Futebol', startTime: '13:40', endTime: '14:40', location: 'Campo de Futebol' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Ano' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Jogos de Tabuleiro', startTime: '15:00', endTime: '15:50', location: 'Sala 1º Ano' },
    ],
  },
  '1º Ano Vermelho': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Vermelho' },
      { activity: 'Natação', startTime: '13:40', endTime: '14:40', location: 'Piscina Grande' },
      { activity: 'Estimulação Psicomotora', startTime: '15:00', endTime: '15:50', location: 'Quadra Coberta' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Vermelho' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Contação de Histórias', startTime: '15:00', endTime: '15:50', location: 'Biblioteca' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Vermelho' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Vermelho' },
      { activity: 'Futebol', startTime: '13:40', endTime: '14:40', location: 'Campo de Futebol' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 1º Vermelho' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Jogos de Tabuleiro', startTime: '15:00', endTime: '15:50', location: 'Sala 1º Vermelho' },
    ],
  },
  '2º Ano Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Ano' },
      { activity: 'Natação', startTime: '13:40', endTime: '14:40', location: 'Piscina Grande' },
      { activity: 'Dança', startTime: '15:00', endTime: '15:50', location: 'Sala de Dança' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Ano' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Ginástica', startTime: '15:00', endTime: '15:50', location: 'Ginásio' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Ano' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Ano' },
      { activity: 'Futebol', startTime: '13:40', endTime: '14:40', location: 'Campo de Futebol' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Ano' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Jogos de Tabuleiro', startTime: '15:00', endTime: '15:50', location: 'Sala 2º Ano' },
    ],
  },
  '2º Ano Vermelho': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Vermelho' },
      { activity: 'Natação', startTime: '13:40', endTime: '14:40', location: 'Piscina Grande' },
      { activity: 'Dança', startTime: '15:00', endTime: '15:50', location: 'Sala de Dança' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Vermelho' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Ginástica', startTime: '15:00', endTime: '15:50', location: 'Ginásio' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Vermelho' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Vermelho' },
      { activity: 'Futebol', startTime: '13:40', endTime: '14:40', location: 'Campo de Futebol' },
      { activity: 'Culinária', startTime: '15:00', endTime: '15:50', location: 'Espaço Gourmet' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 2º Vermelho' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Jogos de Tabuleiro', startTime: '15:00', endTime: '15:50', location: 'Sala 2º Vermelho' },
    ],
  },
  '3º Ano Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Ano' },
      { activity: 'Dança', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Grande' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Ano' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Robótica', startTime: '15:00', endTime: '15:50', location: 'Laboratório Maker' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Ano' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Ano' },
      { activity: 'Flauta', startTime: '13:40', endTime: '14:40', location: 'Sala de Música' },
      { activity: 'Futebol', startTime: '15:00', endTime: '15:50', location: 'Campo de Futebol' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Ano' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Projeto', startTime: '15:00', endTime: '15:50', location: 'Laboratório de Ideias' },
    ],
  },
  '3º Ano Vermelho': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Vermelho' },
      { activity: 'Dança', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Grande' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Vermelho' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Robótica', startTime: '15:00', endTime: '15:50', location: 'Laboratório Maker' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Vermelho' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Vermelho' },
      { activity: 'Flauta', startTime: '13:40', endTime: '14:40', location: 'Sala de Música' },
      { activity: 'Futebol', startTime: '15:00', endTime: '15:50', location: 'Campo de Futebol' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 3º Vermelho' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Projeto', startTime: '15:00', endTime: '15:50', location: 'Laboratório de Ideias' },
    ],
  },
  '4º Ano Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Ano' },
      { activity: 'Dança', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Grande' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Ano' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Robótica', startTime: '15:00', endTime: '15:50', location: 'Laboratório Maker' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Ano' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Ano' },
      { activity: 'Flauta', startTime: '13:40', endTime: '14:40', location: 'Sala de Música' },
      { activity: 'Futebol', startTime: '15:00', endTime: '15:50', location: 'Campo de Futebol' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Ano' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Projeto', startTime: '15:00', endTime: '15:50', location: 'Laboratório de Ideias' },
    ],
  },
  '4º Ano Vermelho': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Vermelho' },
      { activity: 'Dança', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Grande' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Vermelho' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Robótica', startTime: '15:00', endTime: '15:50', location: 'Laboratório Maker' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Vermelho' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Vermelho' },
      { activity: 'Flauta', startTime: '13:40', endTime: '14:40', location: 'Sala de Música' },
      { activity: 'Futebol', startTime: '15:00', endTime: '15:50', location: 'Campo de Futebol' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 4º Vermelho' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Projeto', startTime: '15:00', endTime: '15:50', location: 'Laboratório de Ideias' },
    ],
  },
  '5º Ano Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 5º Ano' },
      { activity: 'Dança', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Grande' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 5º Ano' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Robótica', startTime: '15:00', endTime: '15:50', location: 'Laboratório Maker' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 5º Ano' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 5º Ano' },
      { activity: 'Flauta', startTime: '13:40', endTime: '14:40', location: 'Sala de Música' },
      { activity: 'Futebol', startTime: '15:00', endTime: '15:50', location: 'Campo de Futebol' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 5º Ano' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Projeto', startTime: '15:00', endTime: '15:50', location: 'Laboratório de Ideias' },
    ],
  },
  '6º Ano Azul': {
    segunda: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 6º Ano' },
      { activity: 'Dança', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Natação', startTime: '15:00', endTime: '15:50', location: 'Piscina Grande' },
    ],
    terca: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 6º Ano' },
      { activity: 'Balé', startTime: '13:40', endTime: '14:40', location: 'Sala de Dança' },
      { activity: 'Robótica', startTime: '15:00', endTime: '15:50', location: 'Laboratório Maker' },
    ],
    quarta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 6º Ano' },
      { activity: 'Judô', startTime: '13:40', endTime: '14:40', location: 'Tatame de Judô' },
      { activity: 'Artes', startTime: '15:00', endTime: '15:50', location: 'Ateliê de Artes' },
    ],
    quinta: [
      { activity: 'Devocional', startTime: '13:00', endTime: '13:40', location: 'Sala 6º Ano' },
      { activity: 'Flauta', startTime: '13:40', endTime: '14:40', location: 'Sala de Música' },
      { activity: 'Futebol', startTime: '15:00', endTime: '15:50', location: 'Campo de Futebol' },
    ],
    sexta: [
      { activity: 'Acolhimento', startTime: '13:00', endTime: '13:40', location: 'Sala 6º Ano' },
      { activity: 'Tarefas Escolares', startTime: '13:40', endTime: '14:40', location: 'Sala de Estudos' },
      { activity: 'Projeto', startTime: '15:00', endTime: '15:50', location: 'Laboratório de Ideias' },
    ],
  },
};

/**
 * Gera a lista completa de blocos oficiais de Grade Horária para todas as turmas
 */
export function getDefaultScheduleBlocks(turmasList?: TurmaType[]): ScheduleBlock[] {
  const turmas = turmasList && turmasList.length > 0 ? turmasList : TURMAS_LIST;
  const blocks: ScheduleBlock[] = [];
  const days: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

  turmas.forEach((turma) => {
    const template = OFFICIAL_SCHEDULE_TEMPLATES[turma] || OFFICIAL_SCHEDULE_TEMPLATES['1º Ano Azul'];
    if (!template) return;

    days.forEach((day) => {
      const items = template[day] || [];
      items.forEach((item, idx) => {
        const id = `sched_${turma.replace(/\s+/g, '_').toLowerCase()}_${day}_${idx + 1}`;
        blocks.push({
          id: id,
          turma: turma,
          dayOfWeek: day,
          startTime: item.startTime,
          endTime: item.endTime,
          activityId: item.activity,
          location: item.location || '',
          guidelines: `Atividade oficial de ${item.activity} do Integral para a turma ${turma}.`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    });
  });

  return blocks;
}
