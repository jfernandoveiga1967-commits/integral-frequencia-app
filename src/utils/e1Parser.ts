/**
 * E1 Report Parser & Data Sanitizer
 * 
 * Especialista em parsing de relatórios e planilhas exportadas pelo Sistema E1.
 * Trata codificação de caracteres ISO-8859-1 / Windows-1252, higienização de mojibake,
 * descarte de cabeçalhos/rodapés institucionais (datas, meses, cidades e metadados)
 * e alinhamento estrito de colunas (Matrícula numérica/RA x Nome da Turma Oficial).
 */

import { Student, TurmaType } from '../types';

export interface E1ExtractedStudent {
  matricula: string; // Exclusivamente código/RA numérico do aluno (ex: '2026123' ou 'st-178...')
  name: string;      // Nome completo higienizado do aluno
  turma: string;     // Nome oficial da turma (ex: '1º Ano Azul', 'Maternal Azul')
}

export const E1_TURMA_MAP: Record<string, string> = {
  'KIDS - Mini-Maternal': 'Mini Maternal Azul',
  'KIDS - Maternal': 'Maternal Azul',
  'KIDS - Infantil I': 'Infantil 1 Azul',
  'KIDS - Infantil II': 'Infantil 2 Azul',
  'KIDS - 1 Ano': '1º Ano Azul',
  'TEENS - 2 Ano': '2º Ano Azul',
  'TEENS - 3 Ano': '3º Ano Azul',
  'TEENS - 4 Ano': '4º Ano Azul',
  'TEENS - 5 Ano': '5º Ano Azul',
  'TEENS - 6 Ano': '6º Ano Azul',
};

export const OFFICIAL_TURMAS_LIST = [
  'Mini Maternal Azul',
  'Maternal Azul',
  'Infantil 1 Azul',
  'Infantil 2 Azul',
  '1º Ano Azul',
  '2º Ano Azul',
  '3º Ano Azul',
  '4º Ano Azul',
  '5º Ano Azul',
  '6º Ano Azul',
];

/**
 * Lê o arquivo fornecido pelo usuário utilizando a codificação 'ISO-8859-1' (ou 'Windows-1252')
 * através da API nativa FileReader, garantindo a decodificação correta de acentuação do Sistema E1.
 */
export function readE1FileAsText(file: File, encoding: string = 'ISO-8859-1'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Falha ao ler o arquivo via FileReader'));
    };
    reader.readAsText(file, encoding);
  });
}

/**
 * Higieniza strings para reparar caracteres corrompidos (mojibake),
 * entidades HTML e caracteres de controle, retornando texto limpo e bem acentuado.
 */
export function sanitizeE1String(input: string): string {
  if (!input) return '';
  let str = String(input);

  // Decodifica entidades HTML presentes em tabelas exportadas
  const HTML_ENTITIES: Record<string, string> = {
    '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
    '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
    '&atilde;': 'ã', '&otilde;': 'õ', '&Atilde;': 'Ã', '&Otilde;': 'Õ',
    '&acirc;': 'â', '&ecirc;': 'ê', '&icirc;': 'î', '&ocirc;': 'ô', '&ucirc;': 'û',
    '&Acirc;': 'Â', '&Ecirc;': 'Ê', '&Icirc;': 'Î', '&Ocirc;': 'Ô', '&Ucirc;': 'Û',
    '&ccedil;': 'ç', '&Ccedil;': 'Ç',
    '&ordm;': 'º', '&ordf;': 'ª', '&deg;': '°',
    '&nbsp;': ' ', '&#160;': ' ', '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>',
    '&#225;': 'á', '&#233;': 'é', '&#237;': 'í', '&#243;': 'ó', '&#250;': 'ú',
    '&#193;': 'Á', '&#201;': 'É', '&#205;': 'Í', '&#211;': 'Ó', '&#218;': 'Ú',
    '&#227;': 'ã', '&#245;': 'õ', '&#195;': 'Ã', '&#213;': 'Õ',
    '&#226;': 'â', '&#234;': 'ê', '&#238;': 'î', '&#244;': 'ô', '&#251;': 'û',
    '&#194;': 'Â', '&#202;': 'Ê', '&#206;': 'Î', '&#212;': 'Ô', '&#219;': 'Û',
    '&#231;': 'ç', '&#199;': 'Ç', '&#186;': 'º', '&#170;': 'ª',
  };

  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    if (str.includes(entity)) {
      str = str.split(entity).join(replacement);
    }
  }

  // Correção de Mojibake decorrente de conversão cruzada UTF-8 / Windows-1252
  const MOJIBAKE_REPLACEMENTS: [string, string][] = [
    ['Ã¡', 'á'], ['Ã©', 'é'], ['Ã\xad', 'í'], ['Ã­', 'í'], ['Ã³', 'ó'], ['Ãº', 'ú'],
    ['Ã\xa1', 'á'], ['Ã\xa9', 'é'], ['Ã\xb3', 'ó'], ['Ã\xba', 'ú'],
    ['Ã ', 'à'], ['Ã¨', 'è'], ['Ã¬', 'ì'], ['Ã²', 'ò'], ['Ã¹', 'ù'],
    ['Ã£', 'ã'], ['Ãµ', 'õ'], ['Ã¢', 'â'], ['Ãª', 'ê'], ['Ã®', 'î'],
    ['Ã´', 'ô'], ['Ã»', 'û'], ['Ã§', 'ç'],
    ['Ã\x81', 'Á'], ['Ã\x89', 'É'], ['Ã\x8D', 'Í'], ['Ã\x93', 'Ó'], ['Ã\x9A', 'Ú'],
    ['Ã\x80', 'À'], ['Ã\x88', 'È'], ['Ã\x8C', 'Ì'], ['Ã\x92', 'Ò'], ['Ã\x99', 'Ù'],
    ['Ã\x83', 'Ã'], ['Ã\x95', 'Õ'], ['Ã\x82', 'Â'], ['Ã\x8A', 'Ê'], ['Ã\x8E', 'Î'],
    ['Ã\x94', 'Ô'], ['Ã\x9B', 'Û'], ['Ã\x87', 'Ç'],
    ['Âº', 'º'], ['Âª', 'ª'], ['Â°', '°'],
    ['â€“', '–'], ['â€”', '—'], ['â€"', '–'],
  ];

  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    if (str.includes(bad)) {
      str = str.split(bad).join(good);
    }
  }

  // Remove caracteres de controle estranhos mantendo texto legível
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  str = str.replace(/\s+/g, ' ').trim();

  return str;
}

/**
 * Normaliza qualquer variação de nome de turma do E1 para o nome oficial da aplicação.
 */
export function mapE1TurmaNameToOfficial(rawName: string): string {
  const clean = sanitizeE1String(rawName);
  if (!clean) return '';
  if (E1_TURMA_MAP[clean]) return E1_TURMA_MAP[clean];

  const norm = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ');

  if (norm.includes('mini') && norm.includes('maternal')) return 'Mini Maternal Azul';
  if (norm.includes('maternal')) return 'Maternal Azul';
  if (norm.includes('infantil') && (norm.includes('ii') || norm.includes(' 2'))) return 'Infantil 2 Azul';
  if (norm.includes('infantil') && (norm.includes('i') || norm.includes(' 1'))) return 'Infantil 1 Azul';
  if (norm.includes('1') && norm.includes('ano')) return '1º Ano Azul';
  if (norm.includes('2') && norm.includes('ano')) return '2º Ano Azul';
  if (norm.includes('3') && norm.includes('ano')) return '3º Ano Azul';
  if (norm.includes('4') && norm.includes('ano')) return '4º Ano Azul';
  if (norm.includes('5') && norm.includes('ano')) return '5º Ano Azul';
  if (norm.includes('6') && norm.includes('ano')) return '6º Ano Azul';

  const foundOfficial = OFFICIAL_TURMAS_LIST.find((t) => t.toLowerCase() === clean.toLowerCase());
  if (foundOfficial) return foundOfficial;

  return clean;
}

/**
 * Verifica se um texto corresponde a cabeçalho, rodapé ou metadados do relatório do Sistema E1
 * (ex: datas com meses, nomes de cidade como "Campinas", termos de sistema como "Curso:", "Turno:").
 * Impede categoricamente que linhas informativas sejam confundidas com estudantes ou turmas.
 */
export function isHeaderOrSystemText(text: string): boolean {
  if (!text) return true;
  const clean = sanitizeE1String(text).trim();
  if (clean.length < 2) return true;

  const lower = clean.toLowerCase();

  // 1. Termos de cabeçalho com dois-pontos ou palavras-chave de campos de relatório
  if (
    lower.includes('curso:') ||
    lower.includes('série:') ||
    lower.includes('serie:') ||
    lower.includes('turno:') ||
    lower.includes('período:') ||
    lower.includes('periodo:') ||
    lower.includes('sala:') ||
    lower.includes('horário:') ||
    lower.includes('horario:') ||
    lower.includes('turma:') ||
    lower.includes('quantidade de alunos') ||
    lower.includes('total de alunos') ||
    lower.includes('qtd de alunos') ||
    lower.includes('número de alunos') ||
    lower.includes('numero de alunos') ||
    lower.includes('total geral') ||
    lower.includes('subtotal')
  ) {
    return true;
  }

  // 2. Cidades e locais típicos de cabeçalhos timbrados
  if (
    lower.includes('campinas') ||
    lower.includes('são paulo') ||
    lower.includes('sao paulo') ||
    lower.includes('valinhos') ||
    lower.includes('vinhedo') ||
    lower.includes('hortolândia') ||
    lower.includes('hortolandia') ||
    lower.includes('sumaré') ||
    lower.includes('sumare') ||
    lower.includes('paulínia') ||
    lower.includes('paulinia')
  ) {
    return true;
  }

  // 3. Meses do ano por extenso (típico de "Campinas, 04 de Novembro de 2026")
  const MESES_REGEX = /\b(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
  if (MESES_REGEX.test(lower)) {
    return true;
  }

  // 4. Datas formatadas (ex: 04/11/2026, 04-11-2026, ou "04 de Novembro")
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(lower)) {
    return true;
  }
  if (/\b\d{1,2}\s+de\s+[a-z]+/i.test(lower)) {
    return true;
  }

  // 5. Nomes institucionais ou do software
  if (
    lower.includes('instituto educacional') ||
    lower.includes('colégio crescer') ||
    lower.includes('colegio crescer') ||
    lower.includes('sistema e1') ||
    lower.includes('relatório') ||
    lower.includes('relatorio') ||
    lower.includes('data da emissão') ||
    lower.includes('data de emissão') ||
    lower.includes('hora da emissão') ||
    lower.includes('impresso por') ||
    lower.includes('impresso em') ||
    lower.includes('página') ||
    lower.includes('pagina') ||
    lower.includes('listagem') ||
    lower.includes('coordenação') ||
    lower.includes('coordenacao') ||
    lower.includes('diretoria') ||
    lower.includes('responsável') ||
    lower.includes('responsavel') ||
    lower.includes('assinatura')
  ) {
    return true;
  }

  // 6. Nomes de alunos legítimos nunca possuem dois-pontos ':'
  if (clean.includes(':')) {
    return true;
  }

  return false;
}

/**
 * Identifica se uma célula representa o nome ou cabeçalho de uma Turma.
 */
export function isTurmaString(val: string): boolean {
  if (!val) return false;
  const clean = sanitizeE1String(val).trim();
  const lower = clean.toLowerCase();

  // Se contiver dois-pontos e não começar com turma:
  if (clean.includes(':') && !lower.startsWith('turma:')) {
    return false;
  }

  // Não pode ser texto de cabeçalho geral (cidade, data, etc.)
  if (isHeaderOrSystemText(clean) && !lower.includes('turma:')) {
    return false;
  }

  if (lower.startsWith('turma:')) return true;
  if (lower.includes('ano azul') || lower.includes('maternal azul') || lower.includes('infantil 1 azul') || lower.includes('infantil 2 azul')) return true;
  if (lower.includes('kids -') || lower.includes('teens -')) return true;
  if (clean in E1_TURMA_MAP) return true;
  if (/^[1-6][º°]?\s*ano(\s+azul)?$/i.test(clean)) return true;
  if (/^(mini\s+maternal|maternal|infantil\s+[12iI]{1,2})(\s+azul)?$/i.test(clean)) return true;

  return false;
}

/**
 * Identifica se uma célula representa exclusivamente um código/RA de matrícula de aluno.
 * Regra: Deve ser numérico (ex: '2026123', '84521') ou prefixo de id 'st-178...'.
 * JAMAIS deve conter referências a turmas ('ano', 'azul', 'maternal', etc.) ou cabeçalhos.
 */
export function isNumericMatricula(val: string): boolean {
  if (!val) return false;
  const clean = val.trim();
  const lower = clean.toLowerCase();

  // Rejeição estrita de palavras pedagógicas, turmas e cabeçalhos
  if (
    lower.includes('ano') ||
    lower.includes('azul') ||
    lower.includes('maternal') ||
    lower.includes('infantil') ||
    lower.includes('kids') ||
    lower.includes('teens') ||
    lower.includes('turma') ||
    lower.includes('situa') ||
    lower.includes('status') ||
    lower.includes('aluno') ||
    lower.includes('nome') ||
    isHeaderOrSystemText(clean)
  ) {
    return false;
  }

  // Formato com prefixo st-
  if (/^st-[\w-]+$/i.test(clean)) {
    return true;
  }

  // Formato numérico puro (3 a 12 dígitos)
  if (/^\d{3,12}$/.test(clean)) {
    return true;
  }

  // Formato numérico com hífen ou ponto
  if (/^\d{3,10}[-.]\d{1,4}$/.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Higieniza o valor da matrícula para garantir que contenha exclusivamente
 * código/RA numérico do aluno (ex: '2026123' ou 'st-178...').
 * Rejeita turmas, cabeçalhos ou nomes acidentais.
 */
export function cleanMatriculaValue(val: string, fallbackId?: string): string {
  if (!val) return fallbackId || '';
  const clean = val.trim();

  // Se for turma, cabeçalho ou não contiver dígitos, rejeita categoricamente
  if (isTurmaString(clean) || isHeaderOrSystemText(clean) || !/[0-9]/.test(clean)) {
    return fallbackId || '';
  }

  const match = clean.match(/(?:st-)?\d+(?:[-.]\d+)?/i);
  if (match) {
    return match[0];
  }

  return fallbackId || clean;
}

/**
 * Valida se um valor de texto de célula representa legitimamente o nome do estudante.
 * Aplica sanitização estrita, descartando cabeçalhos de sistema, datas, cidades e termos do E1.
 */
export function isStudentNameCell(val: string): boolean {
  if (!val) return false;
  const clean = sanitizeE1String(val).trim();
  const lower = clean.toLowerCase();

  // Tamanho mínimo razoável para nome de pessoa
  if (clean.length < 3) return false;
  // Apenas números não é nome de aluno
  if (/^\d+$/.test(clean)) return false;

  // Rejeição categórica de cabeçalhos, datas, meses e metadados de sistema
  if (isHeaderOrSystemText(clean)) return false;

  // Cabeçalhos de coluna de tabela
  if (
    lower === 'nome' ||
    lower === 'aluno' ||
    lower === 'nome do aluno' ||
    lower === 'estudante' ||
    lower === 'aluno(a)' ||
    lower === 'estudantes' ||
    lower === 'alunos' ||
    lower === 'nome completo'
  ) {
    return false;
  }

  if (
    lower === 'situação' ||
    lower === 'situacao' ||
    lower === 'status' ||
    lower === 'matrícula' ||
    lower === 'matricula' ||
    lower === 'código' ||
    lower === 'codigo' ||
    lower === 'ra' ||
    lower === 'nº' ||
    lower === 'no' ||
    lower === 'ordem' ||
    lower === 'seq'
  ) {
    return false;
  }

  if (isTurmaString(clean)) return false;
  if (isNumericMatricula(clean)) return false;

  // Deve conter caracteres alfabéticos
  if (!/[a-zA-ZÀ-ÿ]/.test(clean)) return false;

  // Um nome real não contém dois pontos ':'
  if (clean.includes(':')) return false;

  // Um nome real não contém barras ou números de data
  if (/\d{1,2}\/\d{1,2}/.test(clean)) return false;

  // Quantidade mínima de letras para um nome válido
  const letterCount = (clean.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  if (letterCount < 3) return false;

  return true;
}

/**
 * Extrai a turma a partir de texto de cabeçalho ou linha separadora (ex: 'Turma: KIDS - 1 Ano').
 */
export function parseTurmaFromHeaderText(text: string): string | null {
  if (!text) return null;
  const clean = sanitizeE1String(text).trim();

  // Se contiver 'Turma:'
  if (/turma\s*:/i.test(clean)) {
    const parts = clean.split(/turma\s*:/i);
    let after = parts[1]?.trim() || '';
    if (after) {
      const cutoff = after.search(/(Turno|Sala|Período|Periodo|Horário|Horario|Professor|Data|Ano|Série|Serie|Data da Emissão|Qtd|Quantidade):/i);
      if (cutoff > 0) {
        after = after.substring(0, cutoff).trim();
      }
      after = after.replace(/[-–—\s]+$/, '').trim();
      if (after.length > 0) {
        return mapE1TurmaNameToOfficial(after);
      }
    }
  }

  // Se o próprio texto for estritamente uma turma reconhecida diretamente
  if (!isHeaderOrSystemText(clean) && isTurmaString(clean)) {
    return mapE1TurmaNameToOfficial(clean);
  }

  return null;
}

/**
 * Parser principal para relatórios em HTML do Sistema E1.
 * Extrai os alunos garantindo:
 * - Descarte de todas as linhas pré-turma (cabeçalhos, datas, "Campinas", etc.)
 * - Descarte de expressões de metadados ("Curso:", "Série:", "Turno:", "Quantidade de alunos", etc.)
 * - Extração estrita de Matrícula x Nome x Turma Oficial
 */
export function parseE1HtmlReport(htmlContent: string): E1ExtractedStudent[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const results: E1ExtractedStudent[] = [];

  const tables = Array.from(doc.querySelectorAll('table'));
  let currentSectionTurma = '';
  let hasEncounteredFirstTurma = false;

  tables.forEach((table) => {
    // 1. Procura se há cabeçalho "Turma:" precedendo a tabela no DOM
    let precedingTurma = '';
    let cursor: Element | null = table;
    while (cursor && cursor !== doc.body && !precedingTurma) {
      let sibling = cursor.previousElementSibling;
      while (sibling && !precedingTurma) {
        const text = sibling.textContent || '';
        if (/turma\s*:/i.test(text) || (isTurmaString(text) && !isHeaderOrSystemText(text))) {
          const found = parseTurmaFromHeaderText(text);
          if (found) {
            precedingTurma = found;
            break;
          }
        }
        sibling = sibling.previousElementSibling;
      }
      cursor = cursor.parentElement;
    }

    if (precedingTurma) {
      currentSectionTurma = precedingTurma;
      hasEncounteredFirstTurma = true;
    }

    // 2. Analisa as linhas da tabela
    const rows = Array.from(table.querySelectorAll('tr'));
    
    // Identificação de colunas do cabeçalho se houver (th ou primeira tr)
    let colMatriculaIdx = -1;
    let colNomeIdx = -1;
    let colTurmaIdx = -1;
    let colStatusIdx = -1;

    rows.forEach((row) => {
      const rowText = row.textContent || '';

      // Verifica se a própria linha é um cabeçalho de turma
      if (/turma\s*:/i.test(rowText) || (isTurmaString(rowText) && !isHeaderOrSystemText(rowText))) {
        const foundTurma = parseTurmaFromHeaderText(rowText);
        if (foundTurma) {
          currentSectionTurma = foundTurma;
          hasEncounteredFirstTurma = true;
          // Reseta índices de coluna de cabeçalho para a nova turma
          colMatriculaIdx = -1;
          colNomeIdx = -1;
          colTurmaIdx = -1;
          colStatusIdx = -1;
          return;
        }
      }

      // REGRA A: Antes do primeiro cabeçalho válido de turma, ignore qualquer linha
      if (!hasEncounteredFirstTurma) {
        return;
      }

      // Se a linha inteira for texto de sistema/cabeçalho/rodapé (ex: "Quantidade de alunos: 15", "Campinas,...")
      if (isHeaderOrSystemText(rowText)) {
        return;
      }

      const thCells = Array.from(row.querySelectorAll('th'));
      if (thCells.length > 0) {
        thCells.forEach((th, idx) => {
          const text = sanitizeE1String(th.textContent || '').toLowerCase();
          if (/matr[ií]cula|c[oó]d(igo)?|ra\b/i.test(text)) colMatriculaIdx = idx;
          else if (/nome|aluno|estudante/i.test(text)) colNomeIdx = idx;
          else if (/turma|s[eé]rie|classe/i.test(text)) colTurmaIdx = idx;
          else if (/situa[cç][aã]o|status/i.test(text)) colStatusIdx = idx;
        });
        return;
      }

      const tdCells = Array.from(row.querySelectorAll('td'));
      if (tdCells.length === 0) return;

      // Se a linha tiver texto de cabeçalho de coluna disfarçado em <td>
      const firstRowText = sanitizeE1String(tdCells[0]?.textContent || '').toLowerCase();
      if (
        firstRowText === 'matrícula' ||
        firstRowText === 'matricula' ||
        firstRowText === 'nome' ||
        firstRowText === 'nº' ||
        firstRowText === 'no' ||
        firstRowText === 'código' ||
        firstRowText === 'codigo' ||
        firstRowText === 'ordem'
      ) {
        tdCells.forEach((td, idx) => {
          const text = sanitizeE1String(td.textContent || '').toLowerCase();
          if (/matr[ií]cula|c[oó]d(igo)?|ra\b/i.test(text)) colMatriculaIdx = idx;
          else if (/nome|aluno|estudante/i.test(text)) colNomeIdx = idx;
          else if (/turma|s[eé]rie|classe/i.test(text)) colTurmaIdx = idx;
          else if (/situa[cç][aã]o|status/i.test(text)) colStatusIdx = idx;
        });
        return;
      }

      // VARIÁVEIS ESTRITAMENTE SEPARADAS - A TURMA NUNCA SOBRESCREVE A MATRÍCULA
      let rowMatricula = '';
      let rowName = '';
      let rowTurma = currentSectionTurma || '';

      if (colNomeIdx >= 0 && tdCells[colNomeIdx]) {
        // Mapeamento por cabeçalho detectado
        const rawName = tdCells[colNomeIdx]?.textContent || '';
        if (isStudentNameCell(rawName)) {
          rowName = sanitizeE1String(rawName);
        }

        if (colMatriculaIdx >= 0 && tdCells[colMatriculaIdx]) {
          const rawMat = tdCells[colMatriculaIdx]?.textContent || '';
          if (isNumericMatricula(rawMat)) {
            rowMatricula = cleanMatriculaValue(rawMat);
          }
        }

        if (colTurmaIdx >= 0 && tdCells[colTurmaIdx]) {
          const rawTurma = tdCells[colTurmaIdx]?.textContent || '';
          if (isTurmaString(rawTurma) || rawTurma.trim().length > 0) {
            rowTurma = mapE1TurmaNameToOfficial(rawTurma);
          }
        }
      } else {
        // Mapeamento dinâmico linha a linha com detecção estrita de tipos
        tdCells.forEach((td) => {
          const rawCell = (td.textContent || '').trim();
          const cleanCell = sanitizeE1String(rawCell);

          // 1. Se for uma Turma: ATRIBUI EXCLUSIVAMENTE A rowTurma
          if (isTurmaString(cleanCell) && !isHeaderOrSystemText(cleanCell)) {
            rowTurma = mapE1TurmaNameToOfficial(cleanCell);
            return;
          }

          // 2. Se for uma Matrícula numérica/RA: ATRIBUI EXCLUSIVAMENTE A rowMatricula
          if (isNumericMatricula(cleanCell) && !rowMatricula) {
            rowMatricula = cleanMatriculaValue(cleanCell);
            return;
          }

          // 3. Se for Nome de Estudante: ATRIBUI EXCLUSIVAMENTE A rowName
          if (isStudentNameCell(cleanCell) && !rowName) {
            rowName = cleanCell;
            return;
          }
        });
      }

      // REGRA B: A linha só é tratada como aluno se houver nome válido e turma atribuída
      if (!rowName || isHeaderOrSystemText(rowName) || !isStudentNameCell(rowName)) {
        return;
      }

      const finalTurma = rowTurma ? mapE1TurmaNameToOfficial(rowTurma) : currentSectionTurma;
      // Se não tiver turma atribuída, descarta a linha em vez de criar grupo vazio ou "Sem Turma"
      if (!finalTurma || finalTurma.trim().length === 0) {
        return;
      }

      // Sanitização estrita da matrícula
      if (rowMatricula) {
        rowMatricula = cleanMatriculaValue(rowMatricula);
      } else {
        rowMatricula = '';
      }

      const exists = results.some((r) => r.name === rowName && r.turma === finalTurma);
      if (!exists) {
        results.push({
          matricula: rowMatricula,
          name: rowName,
          turma: finalTurma,
        });
      }
    });
  });

  return results;
}

/**
 * Parser para planilhas em array de linhas (SheetJS / XLSX).
 * Garante que colunas de Turma e Matrícula sejam tratadas de forma desacoplada
 * e que cabeçalhos/rodapés pré-turma sejam estritamente descartados.
 */
export function parseE1SheetRows(rows: any[][], defaultTurma?: string): E1ExtractedStudent[] {
  const results: E1ExtractedStudent[] = [];

  // Verifica se a planilha possui cabeçalhos explícitos de Turma
  const hasExplicitTurmaHeaders = rows.some((row) => {
    if (!Array.isArray(row)) return false;
    const rowJoined = row.map((c) => String(c || '').trim()).join(' ');
    return /turma\s*:/i.test(rowJoined) || (isTurmaString(rowJoined) && !isHeaderOrSystemText(rowJoined));
  });

  let currentSectionTurma = hasExplicitTurmaHeaders
    ? ''
    : (defaultTurma ? mapE1TurmaNameToOfficial(defaultTurma) : '');

  let hasEncounteredFirstTurma = !hasExplicitTurmaHeaders && Boolean(currentSectionTurma);

  let colMatriculaIdx = -1;
  let colNomeIdx = -1;
  let colTurmaIdx = -1;

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0) return;

    // Linha de texto único ou título de seção
    const rowJoined = row.map((c) => String(c || '').trim()).join(' ');

    if (/turma\s*:/i.test(rowJoined) || (isTurmaString(rowJoined) && !isHeaderOrSystemText(rowJoined))) {
      const found = parseTurmaFromHeaderText(rowJoined);
      if (found) {
        currentSectionTurma = found;
        hasEncounteredFirstTurma = true;
        colMatriculaIdx = -1;
        colNomeIdx = -1;
        colTurmaIdx = -1;
        return;
      }
    }

    // REGRA A: Antes do primeiro cabeçalho válido de turma, ignore qualquer texto ou célula
    if (!hasEncounteredFirstTurma) {
      return;
    }

    // Ignora linhas que contenham cabeçalhos, datas, meses ou termos de sistema
    if (isHeaderOrSystemText(rowJoined)) {
      return;
    }

    // Detecção de cabeçalho de colunas
    const isHeaderRow = row.some((cell) => {
      const text = sanitizeE1String(String(cell || '')).toLowerCase();
      return (
        text === 'matrícula' ||
        text === 'matricula' ||
        text === 'nome' ||
        text === 'aluno' ||
        text === 'turma' ||
        text === 'ra' ||
        text === 'código' ||
        text === 'codigo'
      );
    });

    if (isHeaderRow) {
      row.forEach((cell, idx) => {
        const text = sanitizeE1String(String(cell || '')).toLowerCase();
        if (/matr[ií]cula|c[oó]d(igo)?|ra\b/i.test(text)) colMatriculaIdx = idx;
        else if (/nome|aluno|estudante/i.test(text)) colNomeIdx = idx;
        else if (/turma|s[eé]rie|classe/i.test(text)) colTurmaIdx = idx;
      });
      return;
    }

    let rowMatricula = '';
    let rowName = '';
    let rowTurma = currentSectionTurma || '';

    if (colNomeIdx >= 0 && row[colNomeIdx] !== undefined) {
      const rawName = String(row[colNomeIdx] || '');
      if (isStudentNameCell(rawName)) {
        rowName = sanitizeE1String(rawName);
      }

      if (colMatriculaIdx >= 0 && row[colMatriculaIdx] !== undefined) {
        const rawMat = String(row[colMatriculaIdx] || '');
        if (isNumericMatricula(rawMat)) {
          rowMatricula = cleanMatriculaValue(rawMat);
        }
      }

      if (colTurmaIdx >= 0 && row[colTurmaIdx] !== undefined) {
        const rawTurma = String(row[colTurmaIdx] || '');
        if (isTurmaString(rawTurma) || rawTurma.trim().length > 0) {
          rowTurma = mapE1TurmaNameToOfficial(rawTurma);
        }
      }
    } else {
      row.forEach((cell) => {
        if (cell === null || cell === undefined) return;
        const rawCell = String(cell).trim();
        const cleanCell = sanitizeE1String(rawCell);

        // Se for Turma: atribui estritamente a rowTurma
        if (isTurmaString(cleanCell) && !isHeaderOrSystemText(cleanCell)) {
          rowTurma = mapE1TurmaNameToOfficial(cleanCell);
          return;
        }

        // Se for Matrícula numérica: atribui estritamente a rowMatricula
        if (isNumericMatricula(cleanCell) && !rowMatricula) {
          rowMatricula = cleanMatriculaValue(cleanCell);
          return;
        }

        // Se for Nome do aluno: atribui a rowName
        if (isStudentNameCell(cleanCell) && !rowName) {
          rowName = cleanCell;
          return;
        }
      });
    }

    // REGRA B: A linha só é tratada como aluno se houver nome válido e turma atribuída
    if (!rowName || isHeaderOrSystemText(rowName) || !isStudentNameCell(rowName)) {
      return;
    }

    const finalTurma = rowTurma ? mapE1TurmaNameToOfficial(rowTurma) : currentSectionTurma;
    if (!finalTurma || finalTurma.trim().length === 0) {
      return;
    }

    if (rowMatricula) {
      rowMatricula = cleanMatriculaValue(rowMatricula);
    } else {
      rowMatricula = '';
    }

    const exists = results.some((r) => r.name === rowName && r.turma === finalTurma);
    if (!exists) {
      results.push({
        matricula: rowMatricula,
        name: rowName,
        turma: finalTurma,
      });
    }
  });

  return results;
}

/**
 * Normaliza o nome do estudante para comparação e busca insensível a acentuação e espaços.
 */
export function normalizeStudentNameForMatching(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gera um ID de documento determinístico para o aluno no Firestore com base no Ano Letivo e no RA ou Nome.
 * Garante que reimportações do mesmo aluno nunca gerem IDs aleatórios ou registros duplicados.
 * Exemplos:
 * - aluno_2027_2027123
 * - aluno_2027_joao_pedro_silva
 */
export function generateDeterministicStudentId(
  anoLetivo: number,
  matricula?: string,
  name?: string
): string {
  const targetYear = anoLetivo || 2026;
  const cleanMat = matricula ? cleanMatriculaValue(matricula) : '';
  const isNumericOrClean = cleanMat && isNumericMatricula(cleanMat);

  if (isNumericOrClean) {
    const rawDigits = cleanMat.replace(/^st-/, '').replace(/[^a-zA-Z0-9_-]/g, '').trim();
    if (rawDigits.length > 0) {
      return `aluno_${targetYear}_${rawDigits}`;
    }
  }

  const normName = normalizeStudentNameForMatching(name || '');
  const slug = normName.replace(/\s+/g, '_').substring(0, 45) || 'sem_nome';
  return `aluno_${targetYear}_${slug}`;
}

/**
 * Retorna uma chave de identidade única do aluno por Ano Letivo, priorizando RA numérico limpo.
 */
export function getStudentIdentityKey(student: {
  anoLetivo?: number;
  matricula?: string;
  name?: string;
}): string {
  const year = student.anoLetivo || 2026;
  const cleanMat = student.matricula ? cleanMatriculaValue(student.matricula) : '';
  if (cleanMat && isNumericMatricula(cleanMat)) {
    const rawNumber = cleanMat.replace(/^st-/, '').replace(/[^a-zA-Z0-9_-]/g, '').trim();
    if (rawNumber) {
      return `${year}_ra_${rawNumber}`;
    }
  }
  const normName = normalizeStudentNameForMatching(student.name || '');
  return `${year}_nom_${normName}`;
}

export interface StudentDuplicateCluster {
  key: string;
  canonical: Student;
  duplicates: Student[];
  idsToDelete: string[];
}

/**
 * Identifica grupos de alunos duplicados para um determinado Ano Letivo (ex: 2027).
 * Agrupa por RA numérico oficial ou Nome normalizado, selecionando o registro canônico mais completo
 * e mapeando com precisão os IDs redundantes para remoção segura do Firestore e do armazenamento local.
 */
export function findDuplicateStudentGroups(
  students: Student[],
  targetAnoLetivo?: number
): {
  groups: StudentDuplicateCluster[];
  totalDuplicatesCount: number;
  allIdsToDelete: string[];
} {
  const list = targetAnoLetivo
    ? (students || []).filter((s) => s && s.anoLetivo === targetAnoLetivo)
    : (students || []).filter((s) => s && s.id);

  // Mapeamento e agrupamento com algoritmo de clusters conexos
  const clusters: Student[][] = [];

  list.forEach((student) => {
    const cleanMat = student.matricula ? cleanMatriculaValue(student.matricula) : '';
    const hasNumMat = Boolean(cleanMat && isNumericMatricula(cleanMat));
    const normName = normalizeStudentNameForMatching(student.name);

    // Tenta encontrar um cluster existente que corresponda a este aluno
    let matchingClusterIndex = -1;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const matchInCluster = cluster.some((member) => {
        // Se ambos possuem anoLetivo definido e são diferentes, não pertencem ao mesmo grupo
        if (student.anoLetivo && member.anoLetivo && student.anoLetivo !== member.anoLetivo) {
          return false;
        }

        const memCleanMat = member.matricula ? cleanMatriculaValue(member.matricula) : '';
        const memHasNumMat = Boolean(memCleanMat && isNumericMatricula(memCleanMat));
        const memNormName = normalizeStudentNameForMatching(member.name);

        // 1. Se ambos possuem RA numérico oficial limpo
        if (hasNumMat && memHasNumMat) {
          return cleanMat === memCleanMat;
        }

        // 2. Se possuem o mesmo nome normalizado
        if (normName && memNormName && normName === memNormName) {
          // Se ambos tiverem RAs numéricos diferentes, não agrupa (são homônimos reais)
          if (hasNumMat && memHasNumMat && cleanMat !== memCleanMat) {
            return false;
          }
          return true;
        }

        return false;
      });

      if (matchInCluster) {
        matchingClusterIndex = i;
        break;
      }
    }

    if (matchingClusterIndex >= 0) {
      clusters[matchingClusterIndex].push(student);
    } else {
      clusters.push([student]);
    }
  });

  const duplicateGroups: StudentDuplicateCluster[] = [];
  const allIdsToDeleteSet = new Set<string>();

  clusters.forEach((members, idx) => {
    if (members.length <= 1) return;

    // Critérios de desempate para seleção do registro canônico ("vencedor"):
    const sorted = [...members].sort((a, b) => {
      // 1. Prioridade: possui matrícula/RA numérico oficial
      const aHasRa = a.matricula && isNumericMatricula(a.matricula) ? 1 : 0;
      const bHasRa = b.matricula && isNumericMatricula(b.matricula) ? 1 : 0;
      if (bHasRa !== aHasRa) return bHasRa - aHasRa;

      // 2. Prioridade: possui bolsa / desconto configurado
      const aBolsa = a.descontoBolsa && a.descontoBolsa > 0 ? 1 : 0;
      const bBolsa = b.descontoBolsa && b.descontoBolsa > 0 ? 1 : 0;
      if (bBolsa !== aBolsa) return bBolsa - aBolsa;

      // 3. Prioridade: tipo de contrato customizado (avulso)
      const aAvulso = a.tipoContrato === 'avulso' ? 1 : 0;
      const bAvulso = b.tipoContrato === 'avulso' ? 1 : 0;
      if (bAvulso !== aAvulso) return bAvulso - aAvulso;

      // 4. Prioridade: ID determinístico padronizado (aluno_${ano}_...)
      const aDet = a.id.startsWith('aluno_') ? 1 : 0;
      const bDet = b.id.startsWith('aluno_') ? 1 : 0;
      if (bDet !== aDet) return bDet - aDet;

      // 5. Prioridade: possui horários de saída customizados
      const aHor = a.horariosSaida && Object.keys(a.horariosSaida).length > 0 ? 1 : 0;
      const bHor = b.horariosSaida && Object.keys(b.horariosSaida).length > 0 ? 1 : 0;
      if (bHor !== aHor) return bHor - aHor;

      // 6. Mais recente ou ordem alfabética estável de ID
      return a.id.localeCompare(b.id);
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);
    const idsToDelete = duplicates
      .map((d) => d.id)
      .filter((id) => id !== canonical.id && !id.startsWith('st-2026-minimaternal'));

    idsToDelete.forEach((id) => allIdsToDeleteSet.add(id));

    duplicateGroups.push({
      key: `cluster_${idx}_${canonical.id}`,
      canonical,
      duplicates,
      idsToDelete,
    });
  });

  return {
    groups: duplicateGroups,
    totalDuplicatesCount: allIdsToDeleteSet.size,
    allIdsToDelete: Array.from(allIdsToDeleteSet),
  };
}
