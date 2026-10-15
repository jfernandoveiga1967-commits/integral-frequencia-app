export type ModuleCategory =
  | 'normas_internas'
  | 'academia_transporte'
  | 'guia_sensivel'
  | 'rotina_operacional'
  | 'seguranca_cuidados'
  | 'postura_fardamento'
  | 'guia_socioemocional';

export type NormaType = 'proibicao' | 'alerta' | 'recomendado' | 'diretriz';

export interface ManualNorma {
  id: string;
  moduleId: ModuleCategory;
  moduleTitle?: string;
  section?: string;
  sectionNumber?: string;
  sectionTitle?: string;
  title: string;
  type: NormaType;
  summary: string;
  details: string[];
  tags: string[];
  order?: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface NormaAceite {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole?: string;
  timestamp: string;
  appVersion: string;
  manualHash: string;
  userIp?: string;
  userAgent?: string;
}

/**
 * Converte o número de seção para valor numérico inteiro (1 a 51) para garantir ordenação crescente contínua
 */
export function parseSectionNumber(section?: string | null): number {
  if (!section) return 999;
  const clean = section.trim().replace(/^seção\s*/i, '');
  const anyNum = clean.match(/\d+/);
  if (anyNum) {
    return parseInt(anyNum[0], 10);
  }
  return 999;
}

/**
 * Comparador numérico para ordenação rigorosa por seção sequencial de 1 a 51
 */
export function compareNormasBySectionNumber(a: ManualNorma, b: ManualNorma): number {
  const numA = parseSectionNumber(a.sectionNumber || a.section);
  const numB = parseSectionNumber(b.sectionNumber || b.section);
  if (numA !== numB) return numA - numB;
  return (a.order ?? 0) - (b.order ?? 0);
}

export const MODULE_METADATA: Record<
  ModuleCategory,
  {
    title: string;
    description: string;
    defaultSectionNumber: string;
    icon: string;
  }
> = {
  rotina_operacional: {
    title: 'Módulo 1: Rotina Operacional',
    description: 'Objetivos, direitos, deveres, ponto eletrônico, rádio frequência 2, refeitório, acolhimento e lições (Seções 1 a 16)',
    defaultSectionNumber: '1',
    icon: 'Award',
  },
  seguranca_cuidados: {
    title: 'Módulo 2: Segurança, Espaços, Academia e Transporte',
    description: 'Vigilância ativa, parque/parcão, banheiros, portões, portaria, emergência, academia e culinária (Seções 17 a 27)',
    defaultSectionNumber: '17',
    icon: 'Bus',
  },
  postura_fardamento: {
    title: 'Módulo 3: Postura, Fardamento e Proibições',
    description: 'Padrão de fardamento, proibição de celular, ética, hierarquia, alergias, enfermaria e ECA (Seções 28 a 38)',
    defaultSectionNumber: '28',
    icon: 'Award',
  },
  guia_socioemocional: {
    title: 'Módulo 4: Guia Socioemocional e Abordagem Sensível',
    description: 'Comunicação acolhedora, não gritar, não puxar, empatia, paciência e mediação em 3 passos (Seções 39 a 51)',
    defaultSectionNumber: '39',
    icon: 'HeartHandshake',
  },
  normas_internas: {
    title: 'Módulo 1: Rotina Operacional',
    description: 'Direitos, deveres, ponto, rádio, refeitório, acolhimento e lições (Seções 1 a 16)',
    defaultSectionNumber: '1',
    icon: 'Award',
  },
  academia_transporte: {
    title: 'Módulo 2: Segurança, Espaços, Academia e Transporte',
    description: 'Deslocamento, 10 regras da academia e segurança de portões (Seções 17 a 27)',
    defaultSectionNumber: '17',
    icon: 'Bus',
  },
  guia_sensivel: {
    title: 'Módulo 4: Guia Socioemocional e Abordagem Sensível',
    description: 'Comunicação assertiva, afeto e acolhimento sensível (Seções 39 a 51)',
    defaultSectionNumber: '39',
    icon: 'HeartHandshake',
  },
};

import { NORMAS_DATA } from "../data/normasData";

export { NORMAS_DATA };
export const INITIAL_MANUAL_NORMAS: ManualNorma[] = NORMAS_DATA;
