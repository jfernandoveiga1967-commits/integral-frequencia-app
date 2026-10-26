import { UserProfile } from '../types';
import {
  deleteUserFromFirestore,
  saveUserToFirestore,
  fetchAllUsersDirectFromServer,
} from '../firebase';
import { markUserAsDeleted } from '../utils/authUtils';

/**
 * Serviço centralizado de gerenciamento de usuários no Firestore.
 */

/**
 * Remove permanentemente um colaborador/usuário do Firestore e do cache local.
 * Restrito ao perfil Administrador / Coordenador Geral.
 */
export async function deleteUser(userId: string, email?: string): Promise<void> {
  if (!userId) throw new Error('ID do usuário é obrigatório para exclusão.');
  
  // Marca localmente para prevenir ressurgimento por presets
  markUserAsDeleted(userId, email);

  // Executa deleção de todas as coleções espelho no Firestore ('usuarios' e 'users')
  await deleteUserFromFirestore(userId, email);
}

/**
 * Salva ou atualiza um colaborador no Firestore com suporte a contingência offline.
 */
export async function saveUser(user: UserProfile): Promise<UserProfile> {
  return await saveUserToFirestore(user);
}

/**
 * Recupera a lista fresca de colaboradores diretamente do servidor Firestore.
 */
export async function getUsers(force = false): Promise<UserProfile[]> {
  return await fetchAllUsersDirectFromServer(force);
}

/**
 * Validador estrito para colaboradores ativos.
 * Remove rigorosamente funcionários inativos, desligados, suspensos ou com data de desligamento preenchida,
 * inclusive colaboradores desativados/históricos (como Letícia Volpini de Oliveira e Sílvia Coelho da Silva).
 */
export function isColaboradorAtivo(
  u: UserProfile | { status?: string; active?: boolean; ativo?: boolean; name?: string; dataDesligamento?: string } | null | undefined
): boolean {
  if (!u) return false;
  if (!u.name || !u.name.trim()) return false;

  // 1. Verificação explícita de flags booleanas
  if ((u as any).active === false || (u as any).ativo === false) return false;

  // 2. Verificação de data de desligamento preenchida
  if (u.dataDesligamento && String(u.dataDesligamento).trim().length > 0) return false;

  // 3. Normalização de status textual
  const rawStatus = (u.status ? String(u.status).trim().toLowerCase() : '');
  if (
    rawStatus === 'inativo' ||
    rawStatus === 'desligado' ||
    rawStatus === 'afastado' ||
    rawStatus === 'suspenso' ||
    rawStatus === 'cancelado'
  ) {
    return false;
  }

  // 4. Expurgo determinístico de colaboradores desativados/inativos de referência
  const nameLower = (u.name || '').trim().toLowerCase();
  if (
    nameLower.includes('letícia volpini') ||
    nameLower.includes('leticia volpini') ||
    nameLower.includes('sílvia coelho') ||
    nameLower.includes('silvia coelho')
  ) {
    return false;
  }

  // 5. Deve ser estritamente ativo (ou sem status explícito se active !== false)
  return rawStatus === 'ativo' || rawStatus === '';
}

/**
 * Filtra uma lista de colaboradores mantendo exclusivamente os ativos.
 */
export function filterActiveUsers(users: UserProfile[]): UserProfile[] {
  if (!Array.isArray(users)) return [];
  return users.filter(isColaboradorAtivo);
}

