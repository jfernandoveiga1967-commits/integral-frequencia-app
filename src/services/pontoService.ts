/**
 * Serviço de Cálculo de Jornada e Regras de Negócio do Livro Ponto.
 * Colégio Crescer - Programa Integral.
 */

import { UserProfile, PontoRecord, HolidayItem } from '../types';
import {
  isSimplifiedTwoPunchUser,
  isContinuousShift,
  isDayShiftComplete,
  calculateDayWorkedMinutes,
  calcularHorasDia,
  parseContractSchedule,
  formatMinutesToHoursAndMinutes,
  formatMinutesToTime,
  parseTimeToMinutes,
  getDayPontoStatus,
  checkIsDiaDescanso,
  DayWorkedMinutesResult,
} from '../utils/pontoUtils';

export {
  isSimplifiedTwoPunchUser,
  isContinuousShift,
  isDayShiftComplete,
  calculateDayWorkedMinutes,
  calcularHorasDia,
  parseContractSchedule,
  formatMinutesToHoursAndMinutes,
  formatMinutesToTime,
  parseTimeToMinutes,
  getDayPontoStatus,
  checkIsDiaDescanso,
};
export type { DayWorkedMinutesResult };

/**
 * Retorna as colunas de batida de ponto esperadas para o colaborador no Espelho de Ponto.
 * - Danyel Pereira e Thaís Grisoni: 2 colunas ('Entrada 1' e 'Saída 1')
 * - Demais colaboradores: 4 colunas ('Entrada 1', 'Saída Almoço', 'Retorno Almoço', 'Saída 2')
 */
export function getPunchColumnsForUser(user?: Partial<UserProfile> | null): Array<{
  key: string;
  label: string;
  shortLabel: string;
}> {
  if (isContinuousShift(user)) {
    return [
      { key: 'entry1', label: 'Entrada 1', shortLabel: 'E1' },
      { key: 'exit1', label: 'Saída 1', shortLabel: 'S1' },
    ];
  }

  return [
    { key: 'entry1', label: 'Entrada 1', shortLabel: 'E1' },
    { key: 'exit1', label: 'Saída Almoço', shortLabel: 'S. Alm' },
    { key: 'entry2', label: 'Retorno Almoço', shortLabel: 'R. Alm' },
    { key: 'exit2', label: 'Saída 2', shortLabel: 'S2' },
  ];
}

/**
 * Verifica se um determinado status de ponto corresponde a falta com desconto de 1 diária.
 */
export function isFaltaComDesconto(status?: string | null): boolean {
  if (!status) return false;
  return (
    status === 'Falta Não Abonada (Descontar 1 Diária)' ||
    status === 'falta_injustificada' ||
    status === 'falta_nao_abonada'
  );
}

/**
 * Lista oficial de opções de ocorrências e justificativas do Livro Ponto.
 */
export const OPCOES_OCORRENCIAS_PONTO = [
  { value: 'normal', label: 'Presença Normal (Trabalhado)' },
  { value: 'Falta Não Abonada (Descontar 1 Diária)', label: 'Falta Não Abonada (Descontar 1 Diária)' },
  { value: 'falta_injustificada', label: 'Falta Injustificada (Descontar 1 Diária)' },
  { value: 'falta_justificada', label: 'Falta Justificada (Abonada / Sem Desconto)' },
  { value: 'atestado', label: 'Atestado Médico (Abonado)' },
  { value: 'feriado', label: 'Feriado (Abonado e Pago)' },
  { value: 'recesso', label: 'Recesso Escolar (Abonado e Pago)' },
  { value: 'compensado', label: 'Dia Compensado / Folga' },
  { value: 'sabado', label: 'Sábado (Folga)' },
  { value: 'domingo', label: 'Domingo (DSR)' },
] as const;
