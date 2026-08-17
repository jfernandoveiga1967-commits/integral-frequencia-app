export type ActivityType = string;

export interface ActivityItem {
  id: string; // e.g. 'Natação', 'Xadrez'
  name: string;
  icon: string; // Lucide icon identifier name (fallback)
  customIconUrl?: string; // Base64 data URL (PNG, SVG, JPG) for custom icon
  description: string;
  defaultEquipment: string;
  requiresRollCall?: boolean; // true = Exige registro de presença na chamada; false = Atividade orientativa da Grade/Rotina
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

export type DayOfWeek = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta';

export interface ScheduleBlock {
  id: string;
  turma: TurmaType;
  dayOfWeek: DayOfWeek;
  startTime: string; // e.g. "13:30"
  endTime: string;   // e.g. "14:20"
  activityId: ActivityType; // Refers to an ActivityItem (e.g. "Rotina", "Natação", "Almoço", etc.)
  location?: string; // e.g. "Piscina", "Refeitório", "Sala de Leitura"
  guidelines?: string; // Orientações para a Monitora/Professor
  createdAt?: string;
  updatedAt?: string;
}

export type UserRole = 'coordenador' | 'professor';

export type HolidayType = 'feriado' | 'recesso';

export interface HolidayItem {
  id: string; // e.g. "hol_2026-09-07" or timestamp
  date: string; // ISO date string "YYYY-MM-DD" (start date)
  endDate?: string; // Optional ISO date string "YYYY-MM-DD" (for ranges/vacations)
  name: string; // e.g. "Independência do Brasil", "Férias Escolares de Julho"
  type: HolidayType;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

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
  allowedClassIds?: string[]; // List of class IDs/names allowed for this teacher/monitor
  canManageStudents?: boolean;
  canMarkAttendance?: boolean;
  updatedAt?: string;
}
