export type ActivityType = string;

export interface ActivityItem {
  id: string; // e.g. 'Natação', 'Xadrez'
  name: string;
  icon: string; // Lucide icon identifier name
  description: string;
  defaultEquipment: string;
  isCustom?: boolean;
}

export type TurmaType = string;

export type AttendanceStatus =
  | 'presente'
  | 'falta'
  | 'saude'
  | 'sem_equipamento'
  | 'saida_antecipada';

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
  exitTime?: string; // e.g., "15:30" for saida_antecipada
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

export type UserRole = 'coordenador' | 'professor';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  cargoLabel: string;
  avatarColor?: string;
  birthDate?: string; // YYYY-MM-DD or DD/MM/YYYY
  pin?: string;
  assignedActivities?: ActivityType[]; // Extracurricular activities assigned to this user
  assignedTurmas?: string[]; // Turmas assigned to this user (optional)
  canManageStudents?: boolean;
  canMarkAttendance?: boolean;
  updatedAt?: string;
}
