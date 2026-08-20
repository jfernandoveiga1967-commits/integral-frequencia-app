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
  const greeting = params.monitorName
    ? `Olá, ${params.monitorName}! 👋`
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
  lines.push(`_${params.coordName ? `Coordenação (${params.coordName})` : 'Coordenação do Programa Integral'} • Colégio Crescer_`);

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
