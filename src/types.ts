export type ActivityType = 
  | 'Natação'
  | 'Balé'
  | 'Dança'
  | 'Judô'
  | 'Futebol'
  | 'Ginástica'
  | 'Flauta';

export type TurmaType = string;

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

export type UserRole = 'coordenador' | 'professor' | 'auxiliar';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  cargoLabel: string;
  avatarColor?: string;
  pin?: string;
}
