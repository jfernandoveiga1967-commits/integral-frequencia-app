/**
 * E1 Report Parser & Data Sanitizer
 * 
 * Especialista em parsing de relatórios e planilhas exportadas pelo Sistema E1.
 * Trata codificação de caracteres ISO-8859-1 / Windows-1252, higienização de mojibake,
 * e alinhamento estrito de colunas (Matrícula numérica/RA x Nome da Turma Oficial).
 */

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
 * Identifica se uma célula representa o nome ou cabeçalho de uma Turma.
 */
export function isTurmaString(val: string): boolean {
  if (!val) return false;
  const clean = sanitizeE1String(val);
  const lower = clean.toLowerCase();

  if (lower.startsWith('turma:')) return true;
  if (lower.includes('ano azul') || lower.includes('maternal') || lower.includes('infantil')) return true;
  if (lower.includes('kids -') || lower.includes('teens -')) return true;
  if (clean in E1_TURMA_MAP) return true;
  if (/^[1-6][º°]?\s*ano/i.test(clean)) return true;

  return false;
}

/**
 * Identifica se uma célula representa exclusivamente um código/RA de matrícula de aluno.
 * Regra: Deve ser numérico (ex: '2026123', '84521') ou prefixo de id 'st-178...'.
 * JAMAIS deve conter referências a turmas ('ano', 'azul', 'maternal', etc.).
 */
export function isNumericMatricula(val: string): boolean {
  if (!val) return false;
  const clean = val.trim();
  const lower = clean.toLowerCase();

  // Rejeição estrita de palavras pedagógicas e turmas
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
    lower.includes('nome')
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
 * Rejeita turmas ou nomes acidentais.
 */
export function cleanMatriculaValue(val: string, fallbackId?: string): string {
  if (!val) return fallbackId || '';
  const clean = val.trim();

  // Se for turma ou não contiver dígitos, rejeita categoricamente
  if (isTurmaString(clean) || !/[0-9]/.test(clean)) {
    return fallbackId || '';
  }

  const match = clean.match(/(?:st-)?\d+(?:[-.]\d+)?/i);
  if (match) {
    return match[0];
  }

  return fallbackId || clean;
}

/**
 * Valida se um valor de texto de célula representa o nome do estudante.
 */
export function isStudentNameCell(val: string): boolean {
  if (!val) return false;
  const clean = sanitizeE1String(val);
  const lower = clean.toLowerCase();

  if (clean.length < 3) return false;
  if (/^\d+$/.test(clean)) return false;
  if (lower === 'nome' || lower === 'aluno' || lower === 'nome do aluno' || lower === 'estudante') return false;
  if (lower === 'situação' || lower === 'situacao' || lower === 'status' || lower === 'matrícula' || lower === 'matricula') return false;
  if (lower === 'nº' || lower === 'no' || lower === 'ordem' || lower === 'código' || lower === 'codigo' || lower === 'ra') return false;
  if (lower.startsWith('página') || lower.startsWith('pagina') || lower.includes('relatório') || lower.includes('sistema e1')) return false;
  if (isTurmaString(clean)) return false;
  if (isNumericMatricula(clean)) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(clean)) return false;

  return true;
}

/**
 * Extrai a turma a partir de texto de cabeçalho ou linha separadora (ex: 'Turma: KIDS - 1 Ano').
 */
export function parseTurmaFromHeaderText(text: string): string | null {
  if (!text || !text.includes('Turma:')) return null;
  const parts = text.split(/Turma:/i);
  let after = parts[1]?.trim() || '';
  if (after) {
    const cutoff = after.search(/(Turno|Sala|Período|Periodo|Horário|Horario|Professor|Data|Ano|Série|Serie|Data da Emissão):/i);
    if (cutoff > 0) {
      after = after.substring(0, cutoff).trim();
    }
    after = after.replace(/[-–—\s]+$/, '').trim();
    if (after.length > 0) {
      return mapE1TurmaNameToOfficial(after);
    }
  }
  return null;
}

/**
 * Parser principal para relatórios em HTML do Sistema E1.
 * Extrai os alunos garantindo alinhamento estrito:
 * - matricula: código/RA numérico (ex: '2026123' ou 'st-178...')
 * - turma: nome oficial da turma (ex: '1º Ano Azul', 'Maternal Azul')
 * - name: nome higienizado do aluno
 */
export function parseE1HtmlReport(htmlContent: string): E1ExtractedStudent[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const results: E1ExtractedStudent[] = [];

  const tables = Array.from(doc.querySelectorAll('table'));
  let currentSectionTurma = '';

  tables.forEach((table) => {
    // 1. Procura se há cabeçalho "Turma:" precedendo a tabela
    let precedingTurma = '';
    let prev = table.previousElementSibling;
    while (prev && !precedingTurma) {
      const bTags = prev.querySelectorAll('b, strong');
      for (const b of Array.from(bTags)) {
        const found = parseTurmaFromHeaderText(b.parentElement?.textContent || b.textContent || '');
        if (found) {
          precedingTurma = found;
          break;
        }
      }
      if (!precedingTurma && prev.textContent?.includes('Turma:')) {
        precedingTurma = parseTurmaFromHeaderText(prev.textContent) || '';
      }
      prev = prev.previousElementSibling;
    }

    if (precedingTurma) {
      currentSectionTurma = precedingTurma;
    }

    // 2. Analisa as linhas da tabela
    const rows = Array.from(table.querySelectorAll('tr'));
    
    // Identificação de colunas do cabeçalho se houver (th ou primeira tr)
    let colMatriculaIdx = -1;
    let colNomeIdx = -1;
    let colTurmaIdx = -1;
    let colStatusIdx = -1;

    rows.forEach((row, rowIndex) => {
      const rowText = row.textContent || '';

      // Verifica se a própria linha é um cabeçalho de turma
      if (rowText.includes('Turma:')) {
        const foundTurma = parseTurmaFromHeaderText(rowText);
        if (foundTurma) {
          currentSectionTurma = foundTurma;
          return;
        }
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

      // Se a linha tiver texto de cabeçalho disfarçado em <td>
      const firstRowText = sanitizeE1String(tdCells[0]?.textContent || '').toLowerCase();
      if (firstRowText === 'matrícula' || firstRowText === 'matricula' || firstRowText === 'nome' || firstRowText === 'nº') {
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
          if (isTurmaString(cleanCell)) {
            rowTurma = mapE1TurmaNameToOfficial(cleanCell);
            return; // Continua a iteração sem tocar em rowMatricula!
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

      // Se encontrou nome do estudante válido na linha
      if (rowName) {
        // Fallback de matrícula se o relatório não tiver coluna de RA
        if (!rowMatricula) {
          rowMatricula = `st-${Date.now()}-${results.length + 1}-${Math.random().toString(36).substring(2, 6)}`;
        }

        // Garante que a matrícula nunca receba o nome da turma
        rowMatricula = cleanMatriculaValue(
          rowMatricula,
          `st-${Date.now()}-${results.length + 1}`
        );

        // Garante que a turma esteja normalizada
        const finalTurma = rowTurma ? mapE1TurmaNameToOfficial(rowTurma) : currentSectionTurma;

        const exists = results.some((r) => r.name === rowName && r.turma === finalTurma);
        if (!exists) {
          results.push({
            matricula: rowMatricula,
            name: rowName,
            turma: finalTurma,
          });
        }
      }
    });
  });

  return results;
}

/**
 * Parser para planilhas em array de linhas (SheetJS / XLSX).
 * Garante que colunas de Turma e Matrícula sejam tratadas de forma desacoplada.
 */
export function parseE1SheetRows(rows: any[][], defaultTurma?: string): E1ExtractedStudent[] {
  const results: E1ExtractedStudent[] = [];
  let currentSectionTurma = defaultTurma ? mapE1TurmaNameToOfficial(defaultTurma) : '';

  let colMatriculaIdx = -1;
  let colNomeIdx = -1;
  let colTurmaIdx = -1;

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0) return;

    // Linha de texto único ou título de seção
    const rowJoined = row.map((c) => String(c || '').trim()).join(' ');
    if (rowJoined.includes('Turma:')) {
      const found = parseTurmaFromHeaderText(rowJoined);
      if (found) {
        currentSectionTurma = found;
        return;
      }
    }

    // Detecção de cabeçalho
    const isHeaderRow = row.some((cell) => {
      const text = sanitizeE1String(String(cell || '')).toLowerCase();
      return text === 'matrícula' || text === 'matricula' || text === 'nome' || text === 'aluno' || text === 'turma';
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
        if (isTurmaString(cleanCell)) {
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

    if (rowName) {
      if (!rowMatricula) {
        rowMatricula = `st-${Date.now()}-${rowIndex + 1}-${Math.random().toString(36).substring(2, 6)}`;
      }

      rowMatricula = cleanMatriculaValue(
        rowMatricula,
        `st-${Date.now()}-${results.length + 1}`
      );

      const finalTurma = rowTurma ? mapE1TurmaNameToOfficial(rowTurma) : currentSectionTurma;

      const exists = results.some((r) => r.name === rowName && r.turma === finalTurma);
      if (!exists) {
        results.push({
          matricula: rowMatricula,
          name: rowName,
          turma: finalTurma,
        });
      }
    }
  });

  return results;
}
