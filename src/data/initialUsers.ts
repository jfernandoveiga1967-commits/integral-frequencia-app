import { UserProfile, UserRole, UserStatus, ALL_APP_TAB_IDS } from '../types';
import { ADMIN_EMAIL, MASTER_ADMIN_ACTIVITIES, MASTER_ADMIN_TURMAS } from '../utils/authUtils';

/**
 * Presets oficiais de usuários do sistema - Colégio Crescer.
 * Perfis de teste/fictícios (Amanda Oliveira, Danyel Pereira, Letícia) foram permanentemente expurgados.
 */
export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'usr_coord_1',
    name: 'Fernando Veiga',
    email: ADMIN_EMAIL,
    role: 'coordenador' as UserRole,
    cargoLabel: 'Coordenador (Administrador)',
    avatarColor: 'bg-amber-500',
    birthDate: '1967-08-12',
    pin: '12/08/1967',
    status: 'ATIVO' as UserStatus,
    workShiftType: 'padrao_8h',
    assignedActivities: MASTER_ADMIN_ACTIVITIES,
    assignedTurmas: MASTER_ADMIN_TURMAS,
    allowedClassIds: MASTER_ADMIN_TURMAS,
    allowedTabs: ALL_APP_TAB_IDS,
    canManageStudents: true,
    canMarkAttendance: true,
    company: 'GADAL - Gestão e Apoio',
    contractSchedule: '07:30 - 17:30',
    baseSalary: 0,
  } as UserProfile,
  {
    id: 'usr_nutri_1',
    name: 'Thaís Grisoni',
    email: 'thaisgriisoni@gmail.com',
    role: 'nutricionista' as UserRole,
    cargoLabel: 'Nutricionista (CRN: 84367)',
    avatarColor: 'bg-teal-600',
    birthDate: '1990-01-01',
    pin: '01/01/1990',
    status: 'ATIVO' as UserStatus,
    assignedActivities: [],
    assignedTurmas: [],
    allowedClassIds: [],
    allowedTabs: ['cardapio', 'ponto'],
    canManageStudents: false,
    canMarkAttendance: false,
    company: 'Colégio Crescer',
    contractSchedule: '08:00 - 14:00',
    contractDailyHours: 6,
    contractDailyMinutes: 360,
  } as UserProfile,
  {
    id: 'usr_danyelpereira',
    name: 'Danyel Pereira',
    email: 'danyel.pereira@crescercampinas.com.br',
    role: 'professor' as UserRole,
    cargoLabel: 'Professor de Flauta',
    avatarColor: 'bg-sky-600',
    birthDate: '1985-05-15',
    pin: '15/05/1985',
    status: 'ATIVO' as UserStatus,
    workShiftType: 'continua_6h',
    assignedActivities: ['Flauta'],
    assignedTurmas: [],
    allowedClassIds: [],
    allowedTabs: ['ponto', 'semanario', 'momento'],
    canManageStudents: false,
    canMarkAttendance: true,
    company: 'Colégio Crescer',
    contractSchedule: '13:00 - 17:30',
    contractDailyHours: 4.5,
    contractDailyMinutes: 270,
  } as UserProfile,
];

export const PRESET_USERS = INITIAL_USERS;
export default INITIAL_USERS;
