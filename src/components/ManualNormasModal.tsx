import React from 'react';
import {
  StatusAceiteModal,
  StatusAceiteModalProps,
} from './ManualOrientacoes';
import {
  syncAcceptanceList,
  isColaboradorAtivo,
  filterActiveUsers,
  AcceptanceSyncResult,
} from '../services/manualService';

export type ManualNormasModalProps = StatusAceiteModalProps;

/**
 * Componente / Modal de Auditoria e Status de Aceite da Equipe no Manual e Normas.
 * Filtra rigorosamente colaboradores ativos, expurgando colaboradores desligados/inativos.
 */
export const ManualNormasModal: React.FC<ManualNormasModalProps> = (props) => {
  return <StatusAceiteModal {...props} />;
};

export {
  StatusAceiteModal,
  syncAcceptanceList,
  isColaboradorAtivo,
  filterActiveUsers,
};

export type { AcceptanceSyncResult };

export default ManualNormasModal;
