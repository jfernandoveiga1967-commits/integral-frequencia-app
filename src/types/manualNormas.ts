
export type ModuleCategory =
  // Nova estrutura oficial: 8 módulos
  | 'identidade_institucional'
  | 'rotina_pedagogica'
  | 'alimentacao_refeitorio'
  | 'saude_higiene'
  | 'seguranca_supervisao'
  | 'academia_transporte'
  | 'abordagem_socioemocional'
  | 'comunicacao_registros'

  // Categorias antigas mantidas para compatibilidade durante a migração
  | 'normas_internas'
  | 'guia_sensivel'
  | 'rotina_operacional'
  | 'seguranca_cuidados'
  | 'postura_fardamento'
  | 'guia_socioemocional';

export type NormaType =
  | 'proibicao'
  | 'alerta'
  | 'recomendado'
  | 'diretriz';

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

export interface ModuleMetadata {
  title: string;
  description: string;
  defaultSectionNumber: string;
  icon: string;
}

/**
 * Converte o número da seção em valor numérico para ordenação.
 */
export function parseSectionNumber(
  section?: string | null
): number {
  if (!section) return 999;

  const clean = section.trim().replace(/^seção\s*/i, '');
  const match = clean.match(/\d+/);

  return match ? parseInt(match[0], 10) : 999;
}

/**
 * Ordena as normas pelo número da seção e, em caso de empate,
 * pelo campo order.
 */
export function compareNormasBySectionNumber(
  a: ManualNorma,
  b: ManualNorma
): number {
  const numA = parseSectionNumber(a.sectionNumber || a.section);
  const numB = parseSectionNumber(b.sectionNumber || b.section);

  if (numA !== numB) return numA - numB;

  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * Remove prefixos redundantes de seção do título.
 */
export function cleanNormaTitle(
  title?: string | null
): string {
  if (!title) return '';

  return title
    .replace(
      /^se[çc][ãa]o\s*\d+\s*[-:•–—]\s*/i,
      ''
    )
    .replace(
      /^\(?se[çc][ãa]o\s*\d+\)?\s*[-:•–—]?\s*/i,
      ''
    )
    .trim();
}

/**
 * Metadados dos oito módulos da nova estrutura.
 *
 * A distribuição das normas entre os módulos será realizada
 * na etapa de reorganização dos dados.
 */
const NEW_MODULE_METADATA: Record<
  Exclude<
    ModuleCategory,
    | 'normas_internas'
    | 'guia_sensivel'
    | 'rotina_operacional'
    | 'seguranca_cuidados'
    | 'postura_fardamento'
    | 'guia_socioemocional'
  >,
  ModuleMetadata
> = {
  identidade_institucional: {
    title: 'Módulo 1: Identidade institucional, equipe e organização do trabalho',
    description:
      'Identidade institucional, responsabilidades da equipe, deveres, organização do trabalho e alinhamento profissional.',
    defaultSectionNumber: '1',
    icon: 'Users',
  },

  rotina_pedagogica: {
    title: 'Módulo 2: Rotina diária, acolhimento e organização pedagógica',
    description:
      'Rotina diária, acolhimento dos alunos, organização pedagógica, acompanhamento das atividades e lições.',
    defaultSectionNumber: '1',
    icon: 'CalendarDays',
  },

  alimentacao_refeitorio: {
    title: 'Módulo 3: Alimentação, refeitório e segurança alimentar',
    description:
      'Organização das refeições, acompanhamento dos alunos, cuidados durante a alimentação e segurança alimentar.',
    defaultSectionNumber: '1',
    icon: 'Utensils',
  },

  saude_higiene: {
    title: 'Módulo 4: Saúde, higiene e cuidados pessoais',
    description:
      'Higiene, cuidados pessoais, atenção às alergias, enfermaria e procedimentos relacionados à saúde dos alunos.',
    defaultSectionNumber: '1',
    icon: 'HeartPulse',
  },

  seguranca_supervisao: {
    title: 'Módulo 5: Segurança, supervisão e prevenção de acidentes',
    description:
      'Supervisão ativa, prevenção de acidentes, controle de acesso, segurança dos espaços e procedimentos de emergência.',
    defaultSectionNumber: '1',
    icon: 'ShieldCheck',
  },

  academia_transporte: {
    title: 'Módulo 6: Academia, atividades externas e transporte',
    description:
      'Deslocamentos, atividades na Academia, transporte, acompanhamento dos grupos e segurança em ambientes externos.',
    defaultSectionNumber: '1',
    icon: 'Bus',
  },

  abordagem_socioemocional: {
    title: 'Módulo 7: Abordagem sensível, limites e desenvolvimento socioemocional',
    description:
      'Comunicação acolhedora, empatia, limites, postura respeitosa, mediação de conflitos e desenvolvimento socioemocional.',
    defaultSectionNumber: '1',
    icon: 'HeartHandshake',
  },

  comunicacao_registros: {
    title: 'Módulo 8: Comunicação, registros, ocorrências e entrega de alunos',
    description:
      'Comunicação com a equipe e as famílias, confidencialidade, registros de ocorrências e procedimentos de entrega dos alunos.',
    defaultSectionNumber: '1',
    icon: 'ClipboardList',
  },
};

/**
 * Metadados unificados.
 *
 * As categorias antigas permanecem disponíveis para que os
 * componentes existentes continuem compilando durante a migração.
 */
export const MODULE_METADATA: Record<
  ModuleCategory,
  ModuleMetadata
> = {
  ...NEW_MODULE_METADATA,

  rotina_operacional: {
    title: 'Módulo 1: Rotina Operacional',
    description:
      'Categoria antiga — será migrada para os oito módulos oficiais.',
    defaultSectionNumber: '1',
    icon: 'Award',
  },

  seguranca_cuidados: {
    title: 'Módulo 2: Segurança, Espaços, Academia e Transporte',
    description:
      'Categoria antiga — será migrada para os oito módulos oficiais.',
    defaultSectionNumber: '17',
    icon: 'Bus',
  },

  postura_fardamento: {
    title: 'Módulo 3: Postura, Fardamento e Proibições',
    description:
      'Categoria antiga — será migrada para os oito módulos oficiais.',
    defaultSectionNumber: '28',
    icon: 'Award',
  },

  guia_socioemocional: {
    title: 'Módulo 4: Guia Socioemocional e Abordagem Sensível',
    description:
      'Categoria antiga — será migrada para os oito módulos oficiais.',
    defaultSectionNumber: '39',
    icon: 'HeartHandshake',
  },

  normas_internas: {
    title: 'Módulo antigo: Normas Internas',
    description:
      'Categoria legada mantida temporariamente para compatibilidade.',
    defaultSectionNumber: '1',
    icon: 'Award',
  },

  guia_sensivel: {
    title: 'Módulo antigo: Guia Sensível',
    description:
      'Categoria legada mantida temporariamente para compatibilidade.',
    defaultSectionNumber: '39',
    icon: 'HeartHandshake',
  },
};
