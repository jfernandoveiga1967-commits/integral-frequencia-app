import React from 'react';
import { FinancialManagement } from './FinancialManagement';
import { Student, UserProfile } from '../types';

interface FinanceiroProps {
  students: Student[];
  currentUser?: UserProfile | null;
  turmas?: string[];
  users?: UserProfile[];
}

/**
 * Módulo Financeiro e Gestão de Contratos do Programa Integral
 * Alias canônico interoperável para FinancialManagement
 */
export const Financeiro: React.FC<FinanceiroProps> = (props) => {
  return <FinancialManagement {...props} />;
};

export default Financeiro;
export { FinancialManagement };
