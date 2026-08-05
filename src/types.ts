export type ActivityType = 
  | 'Natação'
  | 'Balé'
  | 'Dança'
  | 'Judô'
  | 'Futebol'
  | 'Ginástica'
  | 'Flauta';

export type TurmaType =
  | 'Mini Maternal Azul'
  | 'Maternal Azul'
  | 'Infantil 1 Azul'
  | 'Infantil 2 Azul'
  | '1º Ano Azul'
  | '1º Ano Vermelho'
  | '2º Ano Azul'
  | '2º Ano Vermelho'
  | '3º Ano Azul'
  | '3º Ano Vermelho'
  | '4º Ano Azul'
  | '4º Ano Vermelho'
  | '5º Ano Azul'
  | '6º Ano Azul';

export type AttendanceStatus =
  | 'presente'
  | 'falta'
  | 'saude'
  | 'sem_equipamento';

export interface Student {
  id: string;
  name: string;
  turma: TurmaType;
  activities: ActivityType[]; // Extracurricular activities student is enrolled in
  notes?: string;
}

export interface AttendanceRecord {
  id: string; // e.g. "studentId_activity_date"
  studentId: string;
  activity: ActivityType;
  turma: TurmaType;
  date: string; // ISO date string "YYYY-MM-DD"
  weekNumber: number;
  year: number;
  status: AttendanceStatus;
  equipmentMissingDetails?: string; // e.g., "Sem maiô/sunga", "Esqueceu a flauta", "Sem kimono"
  observation?: string; // General notes e.g., "Atestado de 2 dias"
  createdAt: string;
}

export interface WeekInfo {
  year: number;
  weekNumber: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string; // e.g., "Semana 32 (03/08/2026 a 07/08/2026)"
}
