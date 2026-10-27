import { UserProfile } from '../types';
import {
  deleteUserFromFirestore,
  saveUserToFirestore,
  fetchAllUsersDirectFromServer,
} from '../firebase';
import {
  markUserAsDeleted,
  isPurgedUser,
  PURGED_EMAILS,
  PURGED_USER_IDS,
} from '../utils/authUtils';

export { PURGED_EMAILS, PURGED_USER_IDS, isPurgedUser };

/**
 * Serviço centralizado de gerenciamento de usuários no Firestore.
 */

/**
 * Registra os e-mails/IDs no mecanismo de tombstone e cache local para evitar ressurgimento por backups.
 */
export function registerPurgedUsersTombstones(): void {
  try {
    PURGED_EMAILS.forEach((email, idx) => {
      markUserAsDeleted(PURGED_USER_IDS[idx], email);
    });
  } catch (err) {
    console.error('Erro ao registrar tombstones de usuários expurgados:', err);
  }
}

// Auto-executa no carregamento do serviço
registerPurgedUsersTombstones();

/**
 * Filtra e descarta permanentemente qualquer usuário pertencente aos perfis expurgados.
 */
export function filterPurgedUsers(users: UserProfile[]): UserProfile[] {
  if (!Array.isArray(users)) return [];
  return users.filter((u) => !isPurgedUser(u));
}

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
  if (isPurgedUser(user)) {
    throw new Error('Usuário pertence à lista de perfis de teste permanentemente expurgados.');
  }
  return await saveUserToFirestore(user);
}

/**
 * Recupera a lista fresca de colaboradores diretamente do servidor Firestore,
 * aplicando o filtro permanente que descarta perfis de teste expurgados.
 */
export async function getUsers(force = false): Promise<UserProfile[]> {
  registerPurgedUsersTombstones();
  const rawList = await fetchAllUsersDirectFromServer(force);
  return filterPurgedUsers(rawList);
}

/**
 * Validador estrito para colaboradores ativos.
 * Remove rigorosamente funcionários inativos, desligados, suspensos ou com data de desligamento preenchida,
 * inclusive colaboradores desativados/históricos (como Letícia Volpini de Oliveira e Sílvia Coelho da Silva)
 * e perfis de teste permanentemente expurgados.
 */
export function isColaboradorAtivo(
  u: UserProfile | { status?: string; active?: boolean; ativo?: boolean; name?: string; dataDesligamento?: string; email?: string; id?: string } | null | undefined
): boolean {
  if (!u) return false;
  if (!u.name || !u.name.trim()) return false;

  // Expurgo de perfis de teste/fictícios
  if (isPurgedUser(u)) return false;

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
 * Filtra uma lista de colaboradores mantendo exclusivamente os ativos e não expurgados.
 */
export function filterActiveUsers(users: UserProfile[]): UserProfile[] {
  if (!Array.isArray(users)) return [];
  return users.filter((u) => !isPurgedUser(u) && isColaboradorAtivo(u));
}
