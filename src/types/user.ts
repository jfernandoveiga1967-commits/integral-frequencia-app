import { UserProfile, UserRole, UserStatus, RegimeTrabalho, ActivityType } from '../types';

/**
 * Interface do Usuário / Colaborador
 */
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  cargoLabel: string;
  avatarColor?: string;
  birthDate?: string;
  pin?: string;
  status?: UserStatus;
  dataDesligamento?: string;
  motivoDesligamento?: string;
  assignedActivities?: ActivityType[];
  specialtyActivity?: ActivityType;
  assignedTurmas?: string[];
  allowedClassIds?: string[];
  canManageStudents?: boolean;
  canMarkAttendance?: boolean;
  pixKey?: string;
  contractSchedule?: string;
  contractDailyHours?: number;
  contractDailyMinutes?: number;
  contractDailyHoursFormatted?: string;
  baseSalary?: number;
  regimeTrabalho?: RegimeTrabalho;
  regimeContratual?: string; // e.g. 'Prof. Horista', 'CLT', 'mensalista'
  valorHoraAula?: number; // Valor numérico da Hora-Aula (ex: 31.49)
  duracaoAulaMinutos?: number;
  hourlyRate?: number;
  contractDivisorHours?: number;
  ajudaDeCusto?: number; // Ajuda de Custo (ex: 150)
  company?: string;
  empresa?: string; // Alias para Empresa conveniada / Vinculada
  workShiftType?: 'continua_6h' | 'padrao_8h' | 'personalizada';
  updatedAt?: string;
}

export type { UserProfile, UserRole, UserStatus, RegimeTrabalho };
