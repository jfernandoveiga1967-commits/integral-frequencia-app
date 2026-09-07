/**
 * calculosHoras.ts
 *
 * Módulo especializado para regras de cálculo financeiro e apuração de horas
 * na Jornada Padrão (220 horas contratuais + Ajuda de Custo não salarial).
 *
 * Parâmetros da Jornada Padrão:
 * - Divisor mensal contratual: 220 horas.
 * - Carga diária padrão: 8,8 horas (8h48min = 528 minutos).
 * - Ajuda de Custo: R$ 150,00 fixo mensal (provento não salarial / não indenizatório).
 * - Horas Extras: Adicional de 50% ((Valor da Hora * 1,5) * Horas Excedentes).
 * - Faltas / Atrasos: Desconto computado em cima das horas/minutos não trabalhados
 *   com base na carga diária de 8,8h.
 * - Total Líquido Estimado: (Salário Base + Horas Extras - Descontos) + R$ 150,00 (Ajuda de Custo).
 */

// ============================================================================
// CONSTANTES CONTRATUAIS DA JORNADA PADRÃO
// ============================================================================

/** Divisor mensal contratual padrão em horas */
export const DIVISOR_MENSAL_PADRAO = 220;

/** Carga horária diária padrão em formato decimal (8,8 horas) */
export const CARGA_DIARIA_PADRAO_HORAS = 8.8;

/** Carga horária diária padrão em minutos exatos (8h * 60 + 48min = 528 minutos) */
export const CARGA_DIARIA_PADRAO_MINUTOS = 528;

/** Representação amigável da carga diária padrão */
export const CARGA_DIARIA_PADRAO_FORMATADA = '8h48min';

/** Valor fixo mensal da Ajuda de Custo (verba não salarial / não indenizatória) */
export const VALOR_AJUDA_DE_CUSTO_PADRAO = 150.0;

/** Fator multiplicador de hora extra com 50% de adicional (1 + 0.50 = 1.5) */
export const FATOR_HORA_EXTRA_50 = 1.5;

// ============================================================================
// CONSTANTES PARA PROFESSOR HORISTA (POR AULAS DADAS)
// ============================================================================

/** Duração padrão da hora-aula acadêmica em minutos (50 minutos) */
export const DURACAO_AULA_PADRAO_MINUTOS = 50;

/** Percentual legal de Hora-Atividade (5% sobre o salário de aulas) */
export const PERCENTUAL_HORA_ATIVIDADE = 0.05;

/** Fração de DSR (Descanso Semanal Remunerado) do Professor Horista (1/6) */
export const FATOR_DSR_PROFESSOR = 1 / 6;

// ============================================================================
// FUNÇÕES MATEMÁTICAS FUNDAMENTAIS
// ============================================================================

/**
 * Calcula o Valor da Hora com base no Salário Base e no divisor mensal contratual (padrão 220h).
 * @param salarioBase Salário base contratual (ex: R$ 1.500,00)
 * @param divisorHoras Divisor mensal contratual (padrão 220 horas)
 * @returns Valor da hora em Reais (R$)
 */
export function calcularValorHora(salarioBase: number, divisorHoras: number = DIVISOR_MENSAL_PADRAO): number {
  if (isNaN(salarioBase) || salarioBase <= 0) return 0;
  const divisor = divisorHoras > 0 ? divisorHoras : DIVISOR_MENSAL_PADRAO;
  return salarioBase / divisor;
}

/**
 * Calcula o Salário Base a partir do Valor da Hora e do divisor mensal contratual (Valor da Hora x 220).
 * @param valorHora Valor unitário da hora de trabalho
 * @param divisorHoras Divisor mensal contratual (padrão 220 horas)
 * @returns Salário Base em Reais (R$)
 */
export function calcularSalarioBase(valorHora: number, divisorHoras: number = DIVISOR_MENSAL_PADRAO): number {
  if (isNaN(valorHora) || valorHora <= 0) return 0;
  const divisor = divisorHoras > 0 ? divisorHoras : DIVISOR_MENSAL_PADRAO;
  return valorHora * divisor;
}

/**
 * Calcula o valor exato de 1 minuto de trabalho a partir do valor da hora.
 * @param valorHora Valor da hora de trabalho
 * @returns Valor unitário do minuto em Reais (R$)
 */
export function calcularValorMinuto(valorHora: number): number {
  if (isNaN(valorHora) || valorHora <= 0) return 0;
  return valorHora / 60;
}

/**
 * Calcula o valor da diária com base na carga diária de 8,8 horas.
 * diária = Valor da Hora * 8.8 (ou seja, 528 minutos)
 * @param valorHora Valor da hora
 * @param cargaDiariaHoras Carga diária contratual em horas (padrão: 8,8)
 * @returns Valor da diária em Reais (R$)
 */
export function calcularValorDiaria(
  valorHora: number,
  cargaDiariaHoras: number = CARGA_DIARIA_PADRAO_HORAS
): number {
  if (isNaN(valorHora) || valorHora <= 0) return 0;
  return valorHora * cargaDiariaHoras;
}

/**
 * Calcula o valor de horas extras com adicional de 50%:
 * Fórmula: (Valor da Hora * 1,5) * Horas Excedentes
 * @param horasExcedentes Quantidade de horas extras em decimal
 * @param valorHora Valor normal da hora
 * @returns Total a pagar de horas extras 50%
 */
export function calcularHoraExtra50(horasExcedentes: number, valorHora: number): number {
  if (isNaN(horasExcedentes) || horasExcedentes <= 0 || isNaN(valorHora) || valorHora <= 0) {
    return 0;
  }
  const valorHoraExtra = valorHora * FATOR_HORA_EXTRA_50;
  return horasExcedentes * valorHoraExtra;
}

/**
 * Calcula o valor de horas extras apuradas em minutos com adicional de 50%:
 * Fórmula: Minutos Excedentes * ((Valor da Hora * 1,5) / 60)
 * @param minutosExcedentes Total de minutos excedentes apurados
 * @param valorHora Valor normal da hora
 * @returns Total em Reais das horas extras 50%
 */
export function calcularHoraExtra50PorMinutos(minutosExcedentes: number, valorHora: number): number {
  if (isNaN(minutosExcedentes) || minutosExcedentes <= 0 || isNaN(valorHora) || valorHora <= 0) {
    return 0;
  }
  const valorMinutoExtra = (valorHora * FATOR_HORA_EXTRA_50) / 60;
  return minutosExcedentes * valorMinutoExtra;
}

/**
 * Calcula o desconto por falta ou atraso com base na taxa de minutos/horas não trabalhados:
 * Carga diária padrão: 8,8h (528 minutos).
 * Desconto = Minutos não trabalhados * (Valor da Hora / 60)
 * @param minutosNaoTrabalhados Quantidade de minutos em atraso ou não trabalhados
 * @param valorHora Valor normal da hora
 * @returns Valor do desconto em Reais (R$)
 */
export function calcularDescontoFaltaAtraso(minutosNaoTrabalhados: number, valorHora: number): number {
  if (isNaN(minutosNaoTrabalhados) || minutosNaoTrabalhados <= 0 || isNaN(valorHora) || valorHora <= 0) {
    return 0;
  }
  const valorMinuto = valorHora / 60;
  return minutosNaoTrabalhados * valorMinuto;
}

/**
 * Calcula o desconto para faltas injustificadas integrais (dias completos).
 * Cada dia integral de falta abate a carga diária de 8,8 horas:
 * Desconto = Dias de Falta * (Valor da Hora * 8,8)
 * @param diasFalta Quantidade de dias de falta injustificada
 * @param valorHora Valor normal da hora
 * @param cargaDiariaHoras Carga do dia em horas (padrão: 8,8)
 * @returns Valor total do desconto de faltas em Reais (R$)
 */
export function calcularDescontoFaltaIntegral(
  diasFalta: number,
  valorHora: number,
  cargaDiariaHoras: number = CARGA_DIARIA_PADRAO_HORAS
): number {
  if (isNaN(diasFalta) || diasFalta <= 0 || isNaN(valorHora) || valorHora <= 0) {
    return 0;
  }
  const valorDiaria = calcularValorDiaria(valorHora, cargaDiariaHoras);
  return diasFalta * valorDiaria;
}

/**
 * Total Líquido Estimado:
 * Fórmula: (Salário Base + Horas Extras - Descontos) + R$ 150,00 (Ajuda de Custo)
 *
 * Tratamento da Ajuda de Custo:
 * - Provento de natureza NÃO SALARIAL / NÃO INDENIZATÓRIA.
 * - Somado integralmente ao Líquido a Receber.
 * - Sem sofrer descontos de INSS/FGTS.
 * - Sem entrar na base de cálculo de horas extras ou faltas.
 */
export function calcularTotalLiquidoEstimado({
  salarioBase,
  horasExtrasValor,
  totalDescontos,
  ajudaDeCusto = VALOR_AJUDA_DE_CUSTO_PADRAO,
  adicionaisManuais = 0,
  descontosManuais = 0,
}: {
  salarioBase: number;
  horasExtrasValor: number;
  totalDescontos: number;
  ajudaDeCusto?: number;
  adicionaisManuais?: number;
  descontosManuais?: number;
}): number {
  const base = Math.max(0, Number(salarioBase) || 0);
  const extras = Math.max(0, Number(horasExtrasValor) || 0);
  const descontos = Math.max(0, Number(totalDescontos) || 0);
  const ajuda = Math.max(0, Number(ajudaDeCusto) || 0);
  const adic = Math.max(0, Number(adicionaisManuais) || 0);
  const descManuais = Math.max(0, Number(descontosManuais) || 0);

  // Subtotal da folha salarial sujeita a descontos:
  const subtotalSalarial = Math.max(0, base + extras + adic - descontos - descManuais);

  // A Ajuda de Custo é somada diretamente ao líquido sem sofrer descontos:
  const liquidoTotal = subtotalSalarial + ajuda;

  return Math.round(liquidoTotal * 100) / 100;
}

// ============================================================================
// TIPO E APURADOR COMPLETO DO HOLERITE DA JORNADA PADRÃO
// ============================================================================

export interface ApuracaoHoleriteJornadaPadrao {
  salarioBase: number;
  divisorMensalHoras: number; // 220
  cargaDiariaHoras: number; // 8.8
  cargaDiariaMinutos: number; // 528
  cargaDiariaFormatada: string; // "8h48min"
  valorHora: number;
  valorMinuto: number;
  valorDiaria: number;

  // Ajuda de Custo (Não Salarial / Não Indenizatória)
  ajudaDeCusto: number; // R$ 150,00
  ajudaDeCustoDescricao: string;

  // Faltas e Atrasos (Base Carga 8,8h)
  unjustifiedAbsencesCount: number;
  unjustifiedAbsencesDiscount: number;
  totalMissingMinutes: number;
  missingHoursFormatted: string;
  missingHoursDiscount: number;
  totalDescontos: number;

  // Horas Extras (50%)
  totalWorkedMinutes: number;
  totalWorkedFormatted: string;
  totalExtraMinutes: number;
  extraHoursFormatted: string;
  extraHoursDecimal: number;
  fatorHoraExtra: number; // 1.5
  valorHoraExtra50: number; // valorHora * 1.5
  extraHoursAmount: number; // (valorHora * 1.5) * Horas Excedentes

  // Ajustes Avulsos
  manualAddition: number;
  manualAdditionNote?: string;
  manualDiscount: number;
  manualDiscountNote?: string;

  // Totais Finais
  totalProventosSalarial: number; // Salário Base + Horas Extras + Adicionais
  totalProventosGeral: number; // Salário Base + Horas Extras + Adicionais + Ajuda de Custo
  totalLiquidoEstimado: number; // (Salário Base + Horas Extras - Descontos) + Ajuda de Custo
}

/**
 * Executa a apuração matemática completa do holerite da Jornada Padrão (220h + Ajuda de Custo).
 */
export function calcularHoleriteJornadaPadrao({
  salarioBase,
  valorHoraInformado,
  divisorHoras = DIVISOR_MENSAL_PADRAO,
  cargaDiariaHoras = CARGA_DIARIA_PADRAO_HORAS,
  ajudaDeCusto = VALOR_AJUDA_DE_CUSTO_PADRAO,
  unjustifiedAbsencesCount = 0,
  missingMinutes = 0,
  extraMinutes = 0,
  workedMinutes = 0,
  manualAddition = 0,
  manualAdditionNote = '',
  manualDiscount = 0,
  manualDiscountNote = '',
}: {
  salarioBase?: number;
  valorHoraInformado?: number;
  divisorHoras?: number;
  cargaDiariaHoras?: number;
  ajudaDeCusto?: number;
  unjustifiedAbsencesCount?: number;
  missingMinutes?: number;
  extraMinutes?: number;
  workedMinutes?: number;
  manualAddition?: number;
  manualAdditionNote?: string;
  manualDiscount?: number;
  manualDiscountNote?: string;
}): ApuracaoHoleriteJornadaPadrao {
  const safeDivisor = divisorHoras > 0 ? divisorHoras : DIVISOR_MENSAL_PADRAO;
  const safeCargaHoras = cargaDiariaHoras > 0 ? cargaDiariaHoras : CARGA_DIARIA_PADRAO_HORAS;
  const safeCargaMinutos = Math.round(safeCargaHoras * 60);

  // Determinação de Salário Base e Valor da Hora:
  // Salário Base = Valor da Hora * 220
  // Valor da Hora = Salário Base / 220
  let base = 0;
  let vHora = 0;

  if (salarioBase !== undefined && salarioBase !== null && Number(salarioBase) > 0) {
    base = Number(salarioBase);
    vHora = base / safeDivisor;
  } else if (valorHoraInformado !== undefined && valorHoraInformado !== null && Number(valorHoraInformado) > 0) {
    vHora = Number(valorHoraInformado);
    base = vHora * safeDivisor;
  } else {
    base = 1200;
    vHora = base / safeDivisor;
  }

  const vMinuto = vHora / 60;
  const vDiaria = vHora * safeCargaHoras; // Valor de 1 dia de 8,8h

  // Ajuda de Custo Fixa de R$ 150,00
  const safeAjuda = ajudaDeCusto !== undefined && ajudaDeCusto !== null ? Math.max(0, Number(ajudaDeCusto)) : VALOR_AJUDA_DE_CUSTO_PADRAO;

  // Faltas integrais (dias completos) com base na carga diária de 8,8h:
  const absCount = Math.max(0, Number(unjustifiedAbsencesCount) || 0);
  const absDiscount = absCount * vDiaria;

  // Atrasos e saídas antecipadas (minutos parciais):
  const missMin = Math.max(0, Number(missingMinutes) || 0);
  const missDiscount = missMin * vMinuto;

  const totalDescontos = Math.round((absDiscount + missDiscount + (Number(manualDiscount) || 0)) * 100) / 100;

  // Horas Extras com adicional de 50%: (Valor da Hora * 1,5) * Horas Excedentes
  const extMin = Math.max(0, Number(extraMinutes) || 0);
  const vHoraExtra50 = vHora * FATOR_HORA_EXTRA_50;
  const extraHoursAmount = Math.round((extMin * (vHoraExtra50 / 60)) * 100) / 100;

  // Formatadores de tempo
  const extraHoursH = Math.floor(extMin / 60);
  const extraHoursM = extMin % 60;
  const extraHoursFormatted = `${extraHoursH}h${String(extraHoursM).padStart(2, '0')}min`;

  const missH = Math.floor(missMin / 60);
  const missM = missMin % 60;
  const missingHoursFormatted = `${missH}h${String(missM).padStart(2, '0')}min`;

  const workMin = Math.max(0, Number(workedMinutes) || 0);
  const workH = Math.floor(workMin / 60);
  const workM = workMin % 60;
  const totalWorkedFormatted = `${workH}h${String(workM).padStart(2, '0')}min`;

  const cargaH = Math.floor(safeCargaMinutos / 60);
  const cargaM = safeCargaMinutos % 60;
  const cargaDiariaFormatada = `${cargaH}h${String(cargaM).padStart(2, '0')}min`;

  // Totais:
  const safeManualAdd = Math.max(0, Number(manualAddition) || 0);
  const safeManualDesc = Math.max(0, Number(manualDiscount) || 0);

  const totalProventosSalarial = Math.round((base + extraHoursAmount + safeManualAdd) * 100) / 100;
  const totalProventosGeral = Math.round((totalProventosSalarial + safeAjuda) * 100) / 100;

  // Total Líquido Estimado: (Salário Base + Horas Extras - Descontos) + R$ 150,00 (Ajuda de Custo)
  const totalLiquidoEstimado = calcularTotalLiquidoEstimado({
    salarioBase: base,
    horasExtrasValor: extraHoursAmount,
    totalDescontos: absDiscount + missDiscount,
    ajudaDeCusto: safeAjuda,
    adicionaisManuais: safeManualAdd,
    descontosManuais: safeManualDesc,
  });

  return {
    salarioBase: Math.round(base * 100) / 100,
    divisorMensalHoras: safeDivisor,
    cargaDiariaHoras: safeCargaHoras,
    cargaDiariaMinutos: safeCargaMinutos,
    cargaDiariaFormatada,
    valorHora: Math.round(vHora * 100) / 100,
    valorMinuto: Math.round(vMinuto * 10000) / 10000,
    valorDiaria: Math.round(vDiaria * 100) / 100,
    ajudaDeCusto: safeAjuda,
    ajudaDeCustoDescricao: 'Ajuda de Custo (Verba Não Salarial / Não Indenizatória)',
    unjustifiedAbsencesCount: absCount,
    unjustifiedAbsencesDiscount: Math.round(absDiscount * 100) / 100,
    totalMissingMinutes: missMin,
    missingHoursFormatted,
    missingHoursDiscount: Math.round(missDiscount * 100) / 100,
    totalDescontos,
    totalWorkedMinutes: workMin,
    totalWorkedFormatted,
    totalExtraMinutes: extMin,
    extraHoursFormatted,
    extraHoursDecimal: Number((extMin / 60).toFixed(2)),
    fatorHoraExtra: FATOR_HORA_EXTRA_50,
    valorHoraExtra50: Math.round(vHoraExtra50 * 100) / 100,
    extraHoursAmount,
    manualAddition: safeManualAdd,
    manualAdditionNote,
    manualDiscount: safeManualDesc,
    manualDiscountNote,
    totalProventosSalarial,
    totalProventosGeral,
    totalLiquidoEstimado,
  };
}

// ============================================================================
// REGRAS & APURAÇÃO PARA PROFESSOR HORISTA (POR AULAS DADAS)
// ============================================================================

/**
 * Calcula o Total de Aulas Reais (N) com base nos minutos totais trabalhados.
 * Padrão da hora-aula acadêmica no Brasil: 50 minutos (ou personalizável).
 * @param minutosTrabalhados Total de minutos trabalhados apurados no ponto
 * @param duracaoAulaMinutos Duração de cada aula em minutos (padrão: 50)
 * @returns Quantidade N de aulas (arredondado a 2 casas decimais)
 */
export function calcularAulasDeMinutos(
  minutosTrabalhados: number,
  duracaoAulaMinutos: number = DURACAO_AULA_PADRAO_MINUTOS
): number {
  if (isNaN(minutosTrabalhados) || minutosTrabalhados <= 0) return 0;
  const duracao = duracaoAulaMinutos > 0 ? duracaoAulaMinutos : DURACAO_AULA_PADRAO_MINUTOS;
  return Number((minutosTrabalhados / duracao).toFixed(2));
}

/**
 * Salário de Aulas: N * Valor da Hora-Aula
 * @param totalAulas Quantidade N de aulas dadas no mês
 * @param valorHoraAula Valor da hora-aula contratual (R$)
 * @returns Salário de aulas em Reais
 */
export function calcularSalarioAulas(totalAulas: number, valorHoraAula: number): number {
  if (isNaN(totalAulas) || totalAulas <= 0 || isNaN(valorHoraAula) || valorHoraAula <= 0) {
    return 0;
  }
  return Math.round(totalAulas * valorHoraAula * 100) / 100;
}

/**
 * Hora-Atividade (5%): Salário de Aulas * 0,05
 * Verba legal para preparação de aulas e correção de atividades/avaliações (CLT / CCT Professores).
 * @param salarioAulas Salário de Aulas apurado
 * @returns Valor da Hora-Atividade em Reais
 */
export function calcularHoraAtividade(salarioAulas: number): number {
  if (isNaN(salarioAulas) || salarioAulas <= 0) return 0;
  return Math.round(salarioAulas * PERCENTUAL_HORA_ATIVIDADE * 100) / 100;
}

/**
 * DSR - Descanso Semanal Remunerado (1/6):
 * DSR = (Salário de Aulas + Hora-Atividade) / 6
 * Lei 605/49 e Súmula 351 do TST.
 * @param salarioAulas Salário de Aulas
 * @param horaAtividade Hora-Atividade (5%)
 * @returns Valor do DSR em Reais
 */
export function calcularDsrProfessor(salarioAulas: number, horaAtividade: number): number {
  const base = Math.max(0, salarioAulas) + Math.max(0, horaAtividade);
  if (base <= 0) return 0;
  return Math.round((base * FATOR_DSR_PROFESSOR) * 100) / 100;
}

export interface ApuracaoHoleriteProfessorHorista {
  regimeTrabalho: 'professor_horista';
  valorHoraAula: number;
  duracaoAulaMinutos: number;
  totalWorkedMinutes: number;
  totalWorkedFormatted: string;
  totalAulas: number; // N
  salarioAulas: number; // N * valorHoraAula
  horaAtividade: number; // salarioAulas * 0.05
  percentualHoraAtividade: number; // 0.05
  dsr: number; // (salarioAulas + horaAtividade) / 6
  fracaoDsr: number; // 1/6

  // Ajuda de Custo (Não Salarial / Não Indenizatória)
  ajudaDeCusto: number; // R$ 150,00 padrão
  ajudaDeCustoDescricao: string;

  // Ajustes Avulsos
  manualAddition: number;
  manualAdditionNote?: string;
  manualDiscount: number;
  manualDiscountNote?: string;

  // Totais
  totalProventosSalarial: number; // Salário Aulas + Hora-Atividade + DSR + Adicionais
  totalDescontos: number; // Descontos manuais
  totalProventosGeral: number; // Proventos Salariais + Ajuda de Custo
  totalLiquidoEstimado: number; // (Salário Aulas + Hora-Atividade + DSR - Descontos) + Ajuda de Custo
}

/**
 * Executa a apuração matemática completa do holerite para Professor Horista.
 */
export function calcularHoleriteProfessorHorista({
  valorHoraAula,
  totalAulas,
  workedMinutes = 0,
  duracaoAulaMinutos = DURACAO_AULA_PADRAO_MINUTOS,
  ajudaDeCusto = VALOR_AJUDA_DE_CUSTO_PADRAO,
  manualAddition = 0,
  manualAdditionNote = '',
  manualDiscount = 0,
  manualDiscountNote = '',
}: {
  valorHoraAula: number;
  totalAulas?: number;
  workedMinutes?: number;
  duracaoAulaMinutos?: number;
  ajudaDeCusto?: number;
  manualAddition?: number;
  manualAdditionNote?: string;
  manualDiscount?: number;
  manualDiscountNote?: string;
}): ApuracaoHoleriteProfessorHorista {
  const safeHoraAula = Math.max(0, Number(valorHoraAula) || 0);
  const safeDuracao = duracaoAulaMinutos > 0 ? duracaoAulaMinutos : DURACAO_AULA_PADRAO_MINUTOS;
  const safeWorkedMinutes = Math.max(0, Number(workedMinutes) || 0);

  // Se o total de aulas N foi fornecido diretamente usa ele; caso contrário, apura pelas batidas validadas
  const safeAulas = totalAulas !== undefined && totalAulas !== null
    ? Math.max(0, Number(totalAulas))
    : calcularAulasDeMinutos(safeWorkedMinutes, safeDuracao);

  const salarioAulas = calcularSalarioAulas(safeAulas, safeHoraAula);
  const horaAtividade = calcularHoraAtividade(salarioAulas);
  const dsr = calcularDsrProfessor(salarioAulas, horaAtividade);

  const safeAjuda = ajudaDeCusto !== undefined && ajudaDeCusto !== null
    ? Math.max(0, Number(ajudaDeCusto))
    : VALOR_AJUDA_DE_CUSTO_PADRAO;

  const safeManualAdd = Math.max(0, Number(manualAddition) || 0);
  const safeManualDesc = Math.max(0, Number(manualDiscount) || 0);

  const totalProventosSalarial = Math.round((salarioAulas + horaAtividade + dsr + safeManualAdd) * 100) / 100;
  const totalDescontos = safeManualDesc;
  const totalProventosGeral = Math.round((totalProventosSalarial + safeAjuda) * 100) / 100;

  // A Ajuda de Custo (R$ 150,00) deve ser somada diretamente no Total Líquido Estimado,
  // sem incidência de descontos e sem entrar nas bases de cálculo de DSR, horas extras ou faltas:
  const totalLiquidoEstimado = Math.round((totalProventosSalarial - totalDescontos + safeAjuda) * 100) / 100;

  const workH = Math.floor(safeWorkedMinutes / 60);
  const workM = safeWorkedMinutes % 60;
  const totalWorkedFormatted = `${workH}h${String(workM).padStart(2, '0')}min`;

  return {
    regimeTrabalho: 'professor_horista',
    valorHoraAula: safeHoraAula,
    duracaoAulaMinutos: safeDuracao,
    totalWorkedMinutes: safeWorkedMinutes,
    totalWorkedFormatted,
    totalAulas: safeAulas,
    salarioAulas,
    horaAtividade,
    percentualHoraAtividade: PERCENTUAL_HORA_ATIVIDADE,
    dsr,
    fracaoDsr: FATOR_DSR_PROFESSOR,
    ajudaDeCusto: safeAjuda,
    ajudaDeCustoDescricao: 'Ajuda de Custo (Verba Não Salarial / Não Indenizatória)',
    manualAddition: safeManualAdd,
    manualAdditionNote,
    manualDiscount: safeManualDesc,
    manualDiscountNote,
    totalProventosSalarial,
    totalDescontos,
    totalProventosGeral,
    totalLiquidoEstimado,
  };
}

