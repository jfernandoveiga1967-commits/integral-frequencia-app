import React from 'react';
import { ManualOrientacoes, ManualOrientacoesProps } from './ManualOrientacoes';

export interface ManualNormasProps extends ManualOrientacoesProps {}

/**
 * Módulo Manual e Normas do Programa Integral (Colégio Crescer)
 * Re-exporta e sincroniza o componente oficial de diretrizes e normas.
 */
export const ManualNormas: React.FC<ManualNormasProps> = (props) => {
  return <ManualOrientacoes {...props} />;
};

export default ManualNormas;

export { ManualOrientacoes };
export * from './ManualOrientacoes';
