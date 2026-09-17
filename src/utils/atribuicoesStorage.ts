import { TurmaAtribuicao, TurmaType, UserProfile } from '../types';
import { TURMAS_LIST } from '../data/initialData';
import { cleanPhoneNumber, generateWhatsAppUrl } from './whatsappUtils';

export const ATRIBUICOES_STORAGE_KEY = 'quadro_atribuicoes_integral_v1';

/**
 * Função utilitária para gerar IDs consistentes e normalizados para o Quadro de Atribuições
 * Remove acentos, símbolos ordinais ('º', 'ª', '°') e padroniza para evitar inconsistências/duplicatas.
 * Exemplo: '3º Ano Vermelho' ou 'atrib_3º_ano_vermelho' -> 'atrib_3ano_vermelho'
 */
export function generateTurmaAtribuicaoId(turmaName: string): string {
  if (!turmaName) return 'atrib_desconhecida';
  const str = turmaName.trim().replace(/^atrib_/, '');
  const clean = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos / diacríticos
    .toLowerCase()
    .trim()
    .replace(/(\d+)\s*[º°ª]?\s*_?ano/g, '$1ano') // 1º Ano -> 1ano, 3º_ano -> 3ano
    .replace(/[º°ª]/g, '') // outros símbolos ordinais
    .replace(/[^a-z0-9]+/g, '_') // caracteres especiais e espaços -> _
    .replace(/^_+|_+$/g, ''); // remove underscores nas extremidades
  return `atrib_${clean}`;
}

/**
 * Retorna o horário de turno padrão configurado por turma:
 * - Mini Maternal, Maternal, Infantil 1 e Infantil 2: 11:20 - 17:20
 * - 1º Ano Azul: 11:30 - 17:30
 * - Demais turmas: 11:40 - 17:40
 */
export function getDefaultHorarioTurnoForTurma(turmaName: string): string {
  if (!turmaName) return '11:40 - 17:40';
  const clean = turmaName.toLowerCase().trim();
  if (
    clean.includes('mini maternal') ||
    clean.includes('maternal') ||
    clean.includes('infantil 1') ||
    clean.includes('infantil 2')
  ) {
    return '11:20 - 17:20';
  }
  if (clean.includes('1º ano azul') || clean.includes('1ano azul') || clean.includes('1 ano azul')) {
    return '11:30 - 17:30';
  }
  return '11:40 - 17:40';
}

/**
 * Cria uma atribuição em branco para a turma informada
 */
export function buildDefaultAtribuicao(turmaName: string): TurmaAtribuicao {
  const safeId = generateTurmaAtribuicaoId(turmaName);
  return {
    id: safeId,
    turma: turmaName,
    monitoraName: '',
    monitoraPhone: '',
    monitoraId: '',
    monitoraAssistenteName: '',
    monitoraAssistentePhone: '',
    monitoraAssistenteId: '',
    adiName: '',
    adiPhone: '',
    adiId: '',
    horarioTurno: getDefaultHorarioTurnoForTurma(turmaName),
    espacoBase: turmaName,
    observacao: '',
  };
}

/**
 * Estrutura inicial padrão para as turmas oficiais (sem nomes fictícios pré-atribuídos)
 */
export const DEFAULT_QUADRO_ATRIBUICOES: TurmaAtribuicao[] = TURMAS_LIST.map((turmaName) =>
  buildDefaultAtribuicao(turmaName)
);

/**
 * Carrega a lista do Quadro de Atribuições do localStorage
 * Retorna apenas os registros reais salvos; se vazio, retorna array vazio para priorizar o Firestore
 */
export function loadLocalQuadroAtribuicoes(): TurmaAtribuicao[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(ATRIBUICOES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Erro ao carregar Quadro de Atribuições do LocalStorage:', err);
  }
  return [];
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
  const safeId = generateTurmaAtribuicaoId(turmaName);
  const found = atribuicoes.find(
    (a) => a.turma === turmaName || a.id === safeId || a.turma?.toLowerCase().trim() === turmaName.toLowerCase().trim()
  );
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
      id: found.id || safeId,
      monitoraId,
      monitoraPhone,
    };
  }

  // Fallback padrão se for uma turma nova (em branco)
  return buildDefaultAtribuicao(turmaName);
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

  (atribuicoes || []).forEach((item) => {
    if (item && item.turma && turmasSet.has(item.turma)) {
      const safeId = generateTurmaAtribuicaoId(item.turma);
      const prev = existingMap.get(item.turma);

      // Prioriza documentos com safeId correto e com dados preenchidos
      let shouldSet = false;
      if (!prev) {
        shouldSet = true;
      } else if (item.id === safeId && prev.id !== safeId) {
        shouldSet = true;
      } else if (item.monitoraName && !prev.monitoraName) {
        shouldSet = true;
      } else if (item.updatedAt && prev.updatedAt && item.updatedAt > prev.updatedAt) {
        shouldSet = true;
      }

      if (shouldSet) {
        const normalized: TurmaAtribuicao = {
          ...item,
          id: safeId,
          horarioTurno: item.horarioTurno || getDefaultHorarioTurnoForTurma(item.turma),
        };
        existingMap.set(item.turma, normalized);
        existingMap.set(item.turma.toLowerCase().trim(), normalized);
        existingMap.set(safeId, normalized);
      }
    }
  });

  // Garante que cada turma cadastrada tenha seu registro
  return turmasList.map((tName) => {
    const safeId = generateTurmaAtribuicaoId(tName);
    const existing = existingMap.get(tName) || existingMap.get(tName.toLowerCase().trim()) || existingMap.get(safeId);
    if (existing) {
      return {
        ...existing,
        id: safeId,
        turma: tName,
        horarioTurno: existing.horarioTurno || getDefaultHorarioTurnoForTurma(tName),
      };
    }
    return buildDefaultAtribuicao(tName);
  });
}
