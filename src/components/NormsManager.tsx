import React from 'react';
import { ManualOrientacoes, ManualOrientacoesProps } from './ManualOrientacoes';

export interface NormsManagerProps extends ManualOrientacoesProps {}

/**
 * NormsManager
 * Painel de Gestão e Visualização do Manual de 51 Normas do Colégio Crescer.
 */
export const NormsManager: React.FC<NormsManagerProps> = (props) => {
  return <ManualOrientacoes {...props} />;
};

export default NormsManager;
export { ManualOrientacoes };
export * from './ManualOrientacoes';
