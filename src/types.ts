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
  diasFrequencia?: DayOfWeek[]; // Dias da semana em que o aluno frequenta o Integral (ex: ['segunda', 'quarta', 'sexta'])
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

export type PontoStatus =
  | 'normal'
  | 'falta_injustificada'
  | 'falta_justificada'
  | 'atestado'
  | 'feriado'
  | 'recesso'
  | 'compensado'
  | 'sabado'
  | 'domingo';

export interface PontoRecord {
  id: string; // e.g. "userId_YYYY-MM-DD"
  userId: string;
  userName?: string;
  date: string; // ISO date string "YYYY-MM-DD"
  monthKey: string; // "YYYY-MM", e.g. "2026-08"
  dayNumber: number; // 1 to 31
  entry1?: string; // e.g. "11:40"
  exit1?: string; // e.g. ""
  entry2?: string; // e.g. ""
  exit2?: string; // e.g. "17:40"
  status: PontoStatus;
  manualOverride?: boolean;
  note?: string;
  extraMinutes?: number;
  missingMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PontoMonthClosing {
  id: string; // e.g. "userId_YYYY-MM"
  userId: string;
  userName: string;
  userCargo: string;
  monthKey: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  baseSalary: number; // default R$ 1200
  divisorDays: number; // default 30
  contractDailyHours: number; // default 6
  contractDailyMinutes?: number; // e.g. 522 (8h 42min)
  contractDailyHoursFormatted?: string; // e.g. "8h 42min"
  contractSchedule: string; // default "11:40 - 17:40"
  workShiftType?: 'continua_6h' | 'padrao_8h' | 'personalizada';
  companyName: string; // default "GADAL - Gestão e Apoio"
  institutionName: string; // default "Instituto Educacional Crescer"
  pixKey?: string;
  unjustifiedAbsencesCount: number;
  unjustifiedAbsencesDiscount: number;
  extraMinutesTotal: number;
  extraHoursAmount: number;
  manualAddition: number;
  manualAdditionNote?: string;
  manualDiscount: number;
  manualDiscountNote?: string;
  netTotal: number;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  signedDigitally: boolean;
  signedAt?: string;
  signedBy?: string;
  digitalSignatureHash?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string; // Telefone / WhatsApp (ex: 19999999999 ou (19) 99999-9999)
  role: UserRole;
  cargoLabel: string;
  avatarColor?: string;
  birthDate?: string; // YYYY-MM-DD or DD/MM/YYYY
  pin?: string;
  assignedActivities?: ActivityType[]; // Extracurricular activities assigned to this user
  specialtyActivity?: ActivityType; // Legacy or primary specialty activity
  assignedTurmas?: string[]; // Turmas assigned to this user (optional)
  allowedClassIds?: string[]; // List of class IDs/names allowed for this teacher/monitor
  canManageStudents?: boolean;
  canMarkAttendance?: boolean;
  pixKey?: string; // Chave PIX (CPF, Telefone, E-mail ou Aleatória)
  contractSchedule?: string; // Horário contratual (ex: "11:40 - 17:40" ou "07:30 - 11:30 / 13:00 - 17:42")
  contractDailyHours?: number; // Horas diárias contratuais em decimal (ex: 8.7 ou 6)
  contractDailyMinutes?: number; // Horas diárias em minutos totais exatos (ex: 522)
  contractDailyHoursFormatted?: string; // Formato amigável (ex: "8h 42min" ou "6h 00min")
  baseSalary?: number; // Bolsa Auxílio Base (ex: 1200)
  company?: string; // Empresa conveniada (ex: "GADAL")
  workShiftType?: 'continua_6h' | 'padrao_8h' | 'personalizada'; // Tipo de jornada (Contínua 6h sem almoço vs Padrão 8h+ com almoço)
  updatedAt?: string;
}
