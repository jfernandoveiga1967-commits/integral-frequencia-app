import { UserProfile, NormaAceite } from '../types';
import { isColaboradorAtivo, filterActiveUsers } from './userService';

export interface AcceptanceSyncResult {
  activeUsers: UserProfile[];
  purgedCount: number;
  activeAceites: NormaAceite[];
  totalEquipe: number;
  totalCientes: number;
  totalPendentes: number;
  taxaConformidade: number;
}

/**
 * Sincroniza e expurga colaboradores inativos da lista de auditoria e cálculo de conformidade do Manual.
 * Garante que colaboradores inativos/desativados (ex: Letícia Volpini de Oliveira e Sílvia Coelho da Silva)
 * não figurem no cálculo de pendências e métricas.
 */
export function syncAcceptanceList(
  users: UserProfile[],
  aceites: NormaAceite[] = []
): AcceptanceSyncResult {
  const activeUsers = filterActiveUsers(users);
  const activeUserIds = new Set(activeUsers.map((u) => u.id));
  const activeUserEmails = new Set(
    activeUsers.map((u) => (u.email || '').toLowerCase().trim()).filter(Boolean)
  );

  const activeAceites = (aceites || []).filter((a) => {
    if (a.userId && activeUserIds.has(a.userId)) return true;
    if (a.userEmail && activeUserEmails.has(a.userEmail.toLowerCase().trim())) return true;
    return false;
  });

  const totalEquipe = activeUsers.length;
  const cientesUsers = activeUsers.filter((u) =>
    activeAceites.some(
      (a) => a.userId === u.id || (u.email && a.userEmail?.toLowerCase() === u.email.toLowerCase())
    )
  );
  const totalCientes = cientesUsers.length;
  const totalPendentes = totalEquipe - totalCientes;
  const taxaConformidade = totalEquipe > 0 ? Math.round((totalCientes / totalEquipe) * 100) : 0;
  const purgedCount = (users || []).length - activeUsers.length;

  return {
    activeUsers,
    purgedCount,
    activeAceites,
    totalEquipe,
    totalCientes,
    totalPendentes,
    taxaConformidade,
  };
}

export { isColaboradorAtivo, filterActiveUsers };
