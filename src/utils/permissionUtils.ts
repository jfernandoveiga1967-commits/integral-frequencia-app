import { UserProfile, UserRole } from '../types';
import { isCoordenador, isAdmin, detectCargoCategory } from './authUtils';

/**
 * Verifica se o usuário logado possui a função/cargo de Auxiliar (ADI).
 * Considera role 'auxiliar', 'adi', 'auxiliar_adi' e variações no rótulo de cargo ('Auxiliar (ADI)', 'ADI', etc.).
 */
export function isAuxiliar(user?: UserProfile | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').trim().toLowerCase();
  const label = String(user.cargoLabel || '').trim().toLowerCase();

  return (
    role === 'auxiliar' ||
    role === 'adi' ||
    role === 'auxiliar_adi' ||
    label.includes('auxiliar') ||
    label.includes('adi') ||
    label.includes('assistente de desenvolvimento infantil') ||
    detectCargoCategory(user) === 'auxiliar_adi'
  );
}

/**
 * Verifica se o usuário tem permissão para editar o Planejamento/Semanário.
 * Permite Coordenador, Professor e Auxiliar (ADI).
 */
export function canEditSemanario(user?: UserProfile | null): boolean {
  if (!user) return true;
  return isCoordenador(user) || user.role === 'professor' || isAuxiliar(user);
}

/**
 * Verifica se o usuário tem permissão para excluir atividades do Planejamento/Semanário (ícone da lixeira).
 * Permite Coordenador, Professor e Auxiliar (ADI).
 */
export function canDeleteSemanarioActivity(user?: UserProfile | null): boolean {
  if (!user) return true;
  return isCoordenador(user) || user.role === 'professor' || isAuxiliar(user);
}

/**
 * Verifica se o usuário tem permissão para editar e salvar o Quadro de Atribuições de Turmas e Apoio.
 * Permite Coordenador e Auxiliar (ADI).
 */
export function canEditQuadroAtribuicoes(user?: UserProfile | null): boolean {
  if (!user) return false;
  return isCoordenador(user) || isAuxiliar(user);
}

/**
 * Verifica se o usuário tem permissão para excluir um registro de feedback pedagógico.
 * Permite Coordenadores, Administradores ou o próprio criador/autor do feedback.
 */
export function canDeleteFeedback(
  user?: UserProfile | null,
  feedback?: { createdByUserId?: string; user_id?: string; employee_id?: string } | null
): boolean {
  if (!user) return false;
  if (isCoordenador(user) || isAdmin(user)) return true;
  const currentUid = user.id || user.uid;
  if (
    feedback?.createdByUserId &&
    currentUid &&
    String(feedback.createdByUserId).trim() === String(currentUid).trim()
  ) {
    return true;
  }
  return false;
}

export { isCoordenador, isAdmin };
