import { TurmaAtribuicao, TurmaType, UserProfile } from '../types';
import { TURMAS_LIST } from '../data/initialData';
import { cleanPhoneNumber, generateWhatsAppUrl } from './whatsappUtils';

export const ATRIBUICOES_STORAGE_KEY = 'quadro_atribuicoes_integral_v1';

/**
 * Atribuições oficiais padrão para todas as turmas do Programa Integral
 */
export const DEFAULT_QUADRO_ATRIBUICOES: TurmaAtribuicao[] = [
  {
    id: 'atrib_mini_maternal_azul',
    turma: 'Mini Maternal Azul',
    monitoraName: 'Sthefany Martins',
    monitoraPhone: '19998123401',
    adiName: 'Patrícia',
    adiPhone: '19998123402',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala Mini Maternal',
    observacao: 'Foco em desfralde, rotina de acolhimento e alimentação.',
  },
  {
    id: 'atrib_maternal_azul',
    turma: 'Maternal Azul',
    monitoraName: 'Márcia Souza',
    monitoraPhone: '19998123403',
    adiName: 'Patrícia',
    adiPhone: '19998123402',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala Maternal',
    observacao: 'Apoio em higiene, almoço e repouso.',
  },
  {
    id: 'atrib_infantil_1_azul',
    turma: 'Infantil 1 Azul',
    monitoraName: 'Rosana Silva',
    monitoraPhone: '19998123404',
    adiName: 'Juliana',
    adiPhone: '19998123405',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala Infantil 1',
    observacao: 'Estimulação psicomotora, ateliê e descanso.',
  },
  {
    id: 'atrib_infantil_2_azul',
    turma: 'Infantil 2 Azul',
    monitoraName: 'Aline Ferreira',
    monitoraPhone: '19998123406',
    adiName: 'Camila',
    adiPhone: '19998123407',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala Infantil 2',
    observacao: 'Autonomia infantil e transições de atividades.',
  },
  {
    id: 'atrib_1ano_azul',
    turma: '1º Ano Azul',
    monitoraName: 'Ana Clara Carchano Garcia',
    monitoraPhone: '19998765432',
    monitoraId: 'usr_anaclaragarcia',
    adiName: 'Patrícia',
    adiPhone: '19998123402',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 1º Ano Azul',
    observacao: 'Acompanhamento de rotina, tarefas e extracurriculares.',
  },
  {
    id: 'atrib_1ano_vermelho',
    turma: '1º Ano Vermelho',
    monitoraName: 'Ana Clara Carchano Garcia',
    monitoraPhone: '19998765432',
    monitoraId: 'usr_anaclaragarcia',
    adiName: 'Juliana',
    adiPhone: '19998123405',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 1º Ano Vermelho',
    observacao: 'Acompanhamento pedagógico e apoio no recreio.',
  },
  {
    id: 'atrib_2ano_azul',
    turma: '2º Ano Azul',
    monitoraName: 'Sthefany Martins',
    monitoraPhone: '19998123401',
    adiName: 'Camila',
    adiPhone: '19998123407',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 2º Ano Azul',
    observacao: 'Organização de material e apoio nos momentos de oficinas.',
  },
  {
    id: 'atrib_2ano_vermelho',
    turma: '2º Ano Vermelho',
    monitoraName: 'Márcia Souza',
    monitoraPhone: '19998123403',
    adiName: 'Rosana',
    adiPhone: '19998123404',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 2º Ano Vermelho',
    observacao: 'Supervisão pedagógica e recreação dirigida.',
  },
  {
    id: 'atrib_3ano_azul',
    turma: '3º Ano Azul',
    monitoraName: 'Aline Ferreira',
    monitoraPhone: '19998123406',
    adiName: 'Juliana',
    adiPhone: '19998123405',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 3º Ano Azul',
    observacao: 'Apoio em tarefas escolares e mediação de convivência.',
  },
  {
    id: 'atrib_3ano_vermelho',
    turma: '3º Ano Vermelho',
    monitoraName: 'Rosana Silva',
    monitoraPhone: '19998123404',
    adiName: 'Patrícia',
    adiPhone: '19998123402',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 3º Ano Vermelho',
    observacao: 'Projetos e orientação de estudos.',
  },
  {
    id: 'atrib_4ano_azul',
    turma: '4º Ano Azul',
    monitoraName: 'Sthefany Martins',
    monitoraPhone: '19998123401',
    adiName: 'Camila',
    adiPhone: '19998123407',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 4º Ano Azul',
    observacao: 'Projetos investigativos e hábitos de estudo.',
  },
  {
    id: 'atrib_4ano_vermelho',
    turma: '4º Ano Vermelho',
    monitoraName: 'Márcia Souza',
    monitoraPhone: '19998123403',
    adiName: 'Rosana',
    adiPhone: '19998123404',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 4º Ano Vermelho',
    observacao: 'Orientação de estudos e oficinas temáticas.',
  },
  {
    id: 'atrib_5ano_azul',
    turma: '5º Ano Azul',
    monitoraName: 'Aline Ferreira',
    monitoraPhone: '19998123406',
    adiName: 'Juliana',
    adiPhone: '19998123405',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 5º Ano Azul',
    observacao: 'Autonomia nos estudos e projetos integradores.',
  },
  {
    id: 'atrib_6ano_azul',
    turma: '6º Ano Azul',
    monitoraName: 'Ana Clara Carchano Garcia',
    monitoraPhone: '19998765432',
    monitoraId: 'usr_anaclaragarcia',
    adiName: 'Patrícia',
    adiPhone: '19998123402',
    horarioTurno: '11:40 às 17:40',
    espacoBase: 'Sala 6º Ano Azul',
    observacao: 'Acompanhamento da rotina de transição dos Anos Finais.',
  },
];

/**
 * Carrega a lista do Quadro de Atribuições do localStorage ou usa o padrão
 */
export function loadLocalQuadroAtribuicoes(): TurmaAtribuicao[] {
  try {
    const raw = localStorage.getItem(ATRIBUICOES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_QUADRO_ATRIBUICOES];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Garante que todas as turmas oficiais estejam contempladas
      const existingMap = new Map<string, TurmaAtribuicao>();
      parsed.forEach((item) => {
        if (item && item.turma) existingMap.set(item.turma, item);
      });

      DEFAULT_QUADRO_ATRIBUICOES.forEach((def) => {
        if (!existingMap.has(def.turma)) {
          existingMap.set(def.turma, def);
        }
      });

      return Array.from(existingMap.values());
    }
  } catch (err) {
    console.warn('Erro ao carregar Quadro de Atribuições do LocalStorage:', err);
  }
  return [...DEFAULT_QUADRO_ATRIBUICOES];
}

/**
 * Salva a lista do Quadro de Atribuições no localStorage
 */
export function saveLocalQuadroAtribuicoes(items: TurmaAtribuicao[]): void {
  try {
    localStorage.setItem(ATRIBUICOES_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Erro ao salvar Quadro de Atribuições no LocalStorage:', err);
  }
}

/**
 * Extrai o primeiro nome de forma amigável (ex: "Ana Clara Carchano Garcia" -> "Ana")
 */
export function getFirstName(fullName?: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

/**
 * Constrói a mensagem padrão de apoio entre Monitora e ADI
 * Regra estrita: "Olá, {Nome}! Preciso do seu apoio."
 * Não menciona sala porque a turma pode estar em outro espaço.
 */
export function buildApoioDefaultMessage(destinatarioName: string, customMessage?: string): string {
  if (customMessage && customMessage.trim()) {
    return customMessage.trim();
  }
  const name = getFirstName(destinatarioName);
  return name ? `Olá, ${name}! Preciso do seu apoio.` : 'Olá! Preciso do seu apoio.';
}

/**
 * Gera o link direto de WhatsApp para envio de apoio
 */
export function buildApoioWhatsAppUrl(phone: string | undefined, destinatarioName: string, customMessage?: string): string {
  const message = buildApoioDefaultMessage(destinatarioName, customMessage);
  return generateWhatsAppUrl(phone || '', message);
}

/**
 * Resolve a atribuição correspondente a uma turma específica, sincronizando com os dados de usuários
 */
export function resolveAtribuicaoForTurma(
  turmaName: string,
  atribuicoes: TurmaAtribuicao[],
  users: UserProfile[] = []
): TurmaAtribuicao {
  const found = atribuicoes.find((a) => a.turma === turmaName);
  if (found) {
    // Tenta enriquecer com dados atualizados do usuário cadastrado se houver vínculo
    let monitoraPhone = found.monitoraPhone;
    let monitoraId = found.monitoraId;

    if (!monitoraPhone || !monitoraId) {
      const matchingUser = users.find((u) => {
        const uTurmas = u.assignedTurmas || u.allowedClassIds || [];
        return uTurmas.includes(turmaName) || (found.monitoraName && u.name.toLowerCase().includes(found.monitoraName.toLowerCase()));
      });
      if (matchingUser) {
        monitoraId = monitoraId || matchingUser.id;
        monitoraPhone = monitoraPhone || matchingUser.phone;
      }
    }

    return {
      ...found,
      monitoraId,
      monitoraPhone,
    };
  }

  // Fallback padrão se for uma turma nova
  const safeId = `atrib_${turmaName.replace(/\s+/g, '_').toLowerCase()}`;
  return {
    id: safeId,
    turma: turmaName,
    monitoraName: '',
    monitoraPhone: '',
    monitoraAssistenteName: '',
    monitoraAssistentePhone: '',
    adiName: '',
    adiPhone: '',
    horarioTurno: '11:40 às 17:40',
    espacoBase: turmaName,
    observacao: 'Atribuição pedagógica da turma.',
  };
}

/**
 * Filtra e reconcilia as atribuições para conter ESTRITAMENTE as turmas cadastradas em Alunos e Turmas.
 * Nenhuma turma ausente da lista oficial é exibida ou mantida.
 */
export function reconcileAtribuicoesWithTurmas(
  atribuicoes: TurmaAtribuicao[],
  turmasList: string[]
): TurmaAtribuicao[] {
  const turmasSet = new Set(turmasList);
  const existingMap = new Map<string, TurmaAtribuicao>();

  atribuicoes.forEach((item) => {
    if (item && item.turma && turmasSet.has(item.turma)) {
      existingMap.set(item.turma, item);
    }
  });

  // Garante que cada turma cadastrada tenha seu registro
  return turmasList.map((tName) => {
    if (existingMap.has(tName)) {
      return existingMap.get(tName)!;
    }
    const safeId = `atrib_${tName.replace(/\s+/g, '_').toLowerCase()}`;
    return {
      id: safeId,
      turma: tName,
      monitoraName: '',
      monitoraPhone: '',
      monitoraAssistenteName: '',
      monitoraAssistentePhone: '',
      adiName: '',
      adiPhone: '',
      horarioTurno: '11:40 às 17:40',
      espacoBase: tName,
      observacao: 'Atribuição pedagógica da turma.',
    };
  });
}
