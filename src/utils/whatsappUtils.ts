import { UserProfile } from '../types';

/**
 * Utility functions for WhatsApp messaging and link generation
 */

/**
 * Cleans phone number by removing non-digits and ensuring country code (55 for Brazil).
 */
export function cleanPhoneNumber(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // If standard Brazilian mobile/landline without country code (10 or 11 digits, e.g. 19999999999)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // If already includes 55 (12 or 13 digits)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits;
  }

  return digits;
}

/**
 * Formats a phone number for user-friendly display in UI: (XX) XXXXX-XXXX
 */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;

  // Remove leading 55 if present for cleaner national display
  const localDigits = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2) : digits;

  if (localDigits.length === 11) {
    return `(${localDigits.substring(0, 2)}) ${localDigits.substring(2, 7)}-${localDigits.substring(7)}`;
  }
  if (localDigits.length === 10) {
    return `(${localDigits.substring(0, 2)}) ${localDigits.substring(2, 6)}-${localDigits.substring(6)}`;
  }
  return phone;
}

export interface ActivityWhatsAppParams {
  monitorName?: string;
  turmaName: string;
  activityName: string;
  startTime: string;
  endTime: string;
  location?: string;
  guidelines?: string;
  customNote?: string;
  coordName?: string;
}

/**
 * Builds the official formatted WhatsApp message for monitors/teachers
 */
export function buildActivityWhatsAppMessage(params: ActivityWhatsAppParams): string {
  const greeting = params.monitorName && params.monitorName.trim()
    ? `Olá, ${params.monitorName.trim()}! 👋`
    : 'Olá, Monitora/Professor(a)! 👋';

  const lines: string[] = [
    greeting,
    '',
    '🎒 *Comunicado - Programa Integral | Colégio Crescer*',
    '',
    `📌 *Turma:* ${params.turmaName}`,
    `⏰ *Horário:* ${params.startTime} às ${params.endTime}`,
    `⭐ *Atividade:* ${params.activityName}`,
  ];

  if (params.location && params.location.trim()) {
    lines.push(`📍 *Local / Sala:* ${params.location.trim()}`);
  }

  if (params.guidelines && params.guidelines.trim()) {
    lines.push(`📋 *Orientações:* ${params.guidelines.trim()}`);
  }

  if (params.customNote && params.customNote.trim()) {
    lines.push(`💬 *Recado da Coordenação:* ${params.customNote.trim()}`);
  }

  lines.push('');
  lines.push('Agradecemos a atenção e dedicação com nossos alunos!');
  lines.push('');
  const senderName = params.coordName && params.coordName.trim() ? params.coordName.trim() : 'Fernando Veiga';
  lines.push(senderName);
  lines.push('Coordenação do Integral - Colégio Crescer');

  return lines.join('\n');
}

/**
 * Generates the direct WhatsApp link with UTF-8 URL encoded text and emojis
 */
export function generateWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  if (!cleanPhone) {
    return `https://api.whatsapp.com/send?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
}

export interface ResolveCollaboratorParams {
  users?: UserProfile[];
  turmaName?: string;
  activityName?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  targetUserName?: string;
  teacherId?: string;
  monitorId?: string;
}

/**
 * Identifies the exact responsible monitor or teacher specifically linked to a turma/activity.
 * Avoids picking arbitrary first users or fixed fallbacks.
 */
export function findResponsibleCollaborator({
  users = [],
  turmaName = '',
  activityName = '',
  targetUserId,
  targetUserEmail,
  targetUserName,
  teacherId,
  monitorId,
}: ResolveCollaboratorParams): UserProfile | null {
  if (!users || users.length === 0) return null;

  // 1. Exact match by ID (targetUserId, teacherId, monitorId)
  const explicitId = (targetUserId || teacherId || monitorId || '').trim();
  if (explicitId) {
    const directUser = users.find((u) => u.id === explicitId);
    if (directUser) return directUser;
  }

  // 2. Exact match by Email
  const explicitEmail = (targetUserEmail || '').trim().toLowerCase();
  if (explicitEmail) {
    const directByEmail = users.find(
      (u) => (u.email || '').trim().toLowerCase() === explicitEmail
    );
    if (directByEmail) return directByEmail;
  }

  // 3. Exact match by Name
  const explicitName = (targetUserName || '').trim().toLowerCase();
  if (explicitName) {
    const directByName = users.find(
      (u) => (u.name || '').trim().toLowerCase() === explicitName
    );
    if (directByName) return directByName;
  }

  const normActivity = (activityName || '').trim().toLowerCase();
  const normTurma = (turmaName || '').trim().toLowerCase();

  const isActivityMatch = (u: UserProfile) => {
    if (!normActivity) return false;
    const assignedActs = (u.assignedActivities || []).map((a) => a.trim().toLowerCase());
    const specialty = (u.specialtyActivity || '').trim().toLowerCase();
    const cargo = (u.cargoLabel || '').trim().toLowerCase();
    return (
      assignedActs.includes(normActivity) ||
      specialty === normActivity ||
      cargo.includes(normActivity)
    );
  };

  const isTurmaMatch = (u: UserProfile) => {
    if (!normTurma) return false;
    const assignedTurmas = (u.assignedTurmas || u.allowedClassIds || []).map((t) =>
      t.trim().toLowerCase()
    );
    const cargo = (u.cargoLabel || '').trim().toLowerCase();
    return assignedTurmas.includes(normTurma) || cargo.includes(normTurma);
  };

  // 4. Non-coordinators specifically assigned to BOTH Activity and Turma
  const exactBoth = users.find(
    (u) => u.role !== 'coordenador' && isActivityMatch(u) && isTurmaMatch(u)
  );
  if (exactBoth) return exactBoth;

  // 5. Check if it is an extracurricular specialized activity
  const isSpecialistExtracurricular =
    normActivity !== '' &&
    normActivity !== 'rotina' &&
    normActivity !== 'almoço' &&
    normActivity !== 'almoco' &&
    normActivity !== 'recreio' &&
    normActivity !== 'parque' &&
    normActivity !== 'lição de casa' &&
    normActivity !== 'licao de casa' &&
    normActivity !== 'estudo orientado' &&
    normActivity !== 'descanso' &&
    normActivity !== 'lanche' &&
    normActivity !== 'saída' &&
    normActivity !== 'saida' &&
    normActivity !== 'acolhida';

  if (isSpecialistExtracurricular) {
    // For specialist activity, check if there is an activity specialist teacher first
    const actSpecialist = users.find((u) => u.role !== 'coordenador' && isActivityMatch(u));
    if (actSpecialist) return actSpecialist;

    const turmaMonitor = users.find((u) => u.role !== 'coordenador' && isTurmaMatch(u));
    if (turmaMonitor) return turmaMonitor;
  } else {
    // For regular routine/turma activities, prefer the Turma monitor
    const turmaMonitor = users.find((u) => u.role !== 'coordenador' && isTurmaMatch(u));
    if (turmaMonitor) return turmaMonitor;

    const actSpecialist = users.find((u) => u.role !== 'coordenador' && isActivityMatch(u));
    if (actSpecialist) return actSpecialist;
  }

  // 6. Coordinator matching Turma or Activity specifically
  const coordMatch =
    users.find((u) => isTurmaMatch(u) && isActivityMatch(u)) ||
    users.find((u) => isTurmaMatch(u)) ||
    users.find((u) => isActivityMatch(u));
  if (coordMatch) return coordMatch;

  // 7. No fallback to generic users[0] - return null so UI handles unassigned state accurately
  return null;
}

