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
