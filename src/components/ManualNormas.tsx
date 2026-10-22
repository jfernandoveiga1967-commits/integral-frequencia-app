import React from 'react';
import { ManualOrientacoes, ManualOrientacoesProps } from './ManualOrientacoes';
import { NORMAS_DATA, normalizeAndDeduplicateNormas, cleanNormaTitle, MODULES_METADATA_4 } from '../data/normasData';

export interface ManualNormasProps extends ManualOrientacoesProps {}

/**
 * Retorna as 16 diretrizes oficiais do Módulo 1 (Rotina Operacional),
 * estritamente sequenciais de Seção 1 a Seção 16, sem duplicidades.
 */
export function getNormasModulo1() {
  return normalizeAndDeduplicateNormas(NORMAS_DATA).filter((n) => n.moduleId === 'rotina_operacional');
}

/**
 * Módulo Manual e Normas do Programa Integral (Colégio Crescer)
 * Consolida todas as diretrizes da 'Rotina Operacional' sob um ÚNICO bloco visual do 'Módulo 1: Rotina Operacional',
 * com identificadores estritamente sequenciais (Seção 1 a 16) e sem duplicações de cabeçalhos.
 */
export const ManualNormas: React.FC<ManualNormasProps> = (props) => {
  return <ManualOrientacoes {...props} />;
};

export default ManualNormas;

export { ManualOrientacoes, normalizeAndDeduplicateNormas, cleanNormaTitle, NORMAS_DATA, MODULES_METADATA_4 };
export * from './ManualOrientacoes';
