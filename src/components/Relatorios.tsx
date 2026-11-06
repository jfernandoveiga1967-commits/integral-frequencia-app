import React from 'react';
import { WeeklyReport } from './WeeklyReport';
import { MealReportModal } from './MealReportModal';
import {
  calculateRelatorioConsolidado,
  getPeriodConsolidatedMetrics,
  getDailyConsolidatedMetrics,
} from '../utils/frequenciaUtils';

/**
 * Módulo de Relatórios Consolidado e Financeiro de Refeições
 * Ponto de entrada canônico para relatórios do Programa Integral
 */

export const Relatorios = WeeklyReport;
export default WeeklyReport;

export {
  WeeklyReport,
  MealReportModal,
  MealReportModal as RelatorioRefeicoes,
  MealReportModal as RelatorioFinanceiroRefeicoes,
  calculateRelatorioConsolidado,
  getPeriodConsolidatedMetrics,
  getDailyConsolidatedMetrics,
};
