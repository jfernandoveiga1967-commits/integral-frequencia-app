import { TurmaType } from '../types';

/**
 * Calculates a sorting weight for a school class (turma) based on pedagogical/segment chronology:
 * 1. Mini Maternal (~10)
 * 2. Maternal (~20)
 * 3. Infantil 1 / Pré 1 (~30)
 * 4. Infantil 2 / Pré 2 (~40)
 * 5. Infantil 3 / Pré 3 (~50)
 * 6. 1º Ano (~110)
 * 7. 2º Ano (~120)
 * 8. 3º Ano (~130)
 * 9. 4º Ano (~140)
 * 10. 5º Ano (~150)
 * 11. 6º Ano (~160)
 * 12. 7º Ano ao 9º Ano (~170-190)
 * 13. Ensino Médio (~500)
 */
export function getTurmaPedagogicalWeight(turmaName: string): number {
  if (!turmaName) return 9999;
  const name = turmaName.trim().toLowerCase();

  // 1. Mini Maternal (must be evaluated before Maternal)
  if (
    name.includes('mini maternal') ||
    name.includes('mini-maternal') ||
    name.includes('minimaternal') ||
    name.startsWith('mini')
  ) {
    return 10;
  }

  // 2. Maternal
  if (name.includes('maternal')) {
    if (name.includes('1') || (name.includes(' i') && !name.includes(' ii'))) return 21;
    if (name.includes('2') || name.includes(' ii')) return 22;
    return 20;
  }

  // 3. Infantil 1 / Pré 1 / Infantil I
  if (
    name.includes('infantil 1') ||
    (name.includes('infantil i') && !name.includes('infantil ii') && !name.includes('infantil iii')) ||
    name.includes('pré 1') ||
    name.includes('pre 1') ||
    name.includes('pré i') ||
    name.includes('pre i')
  ) {
    return 30;
  }

  // 4. Infantil 2 / Pré 2 / Infantil II
  if (
    name.includes('infantil 2') ||
    (name.includes('infantil ii') && !name.includes('infantil iii')) ||
    name.includes('pré 2') ||
    name.includes('pre 2') ||
    name.includes('pré ii') ||
    name.includes('pre ii')
  ) {
    return 40;
  }

  // 5. Infantil 3 / Pré 3 / Infantil III
  if (
    name.includes('infantil 3') ||
    name.includes('infantil iii') ||
    name.includes('pré 3') ||
    name.includes('pre 3')
  ) {
    return 50;
  }

  // General Infantil if not specified
  if (name.includes('infantil')) {
    return 45;
  }

  // Special case: composite ranges like "6º ao 9º Ano", "6 ao 9", etc.
  if (name.includes('6') && (name.includes('9') || name.includes('ao') || name.includes('a 9'))) {
    return 195;
  }

  // 6. Ensino Fundamental (1º ao 9º Ano)
  const anoMatch = name.match(/(\d+)\s*(?:º|°|o|ª|\.|\-)?\s*(?:ano|série|serie)?/);
  if (anoMatch) {
    const num = parseInt(anoMatch[1], 10);
    if (num >= 1 && num <= 9) {
      return 100 + num * 10; // 1º Ano -> 110, 2º Ano -> 120, ..., 6º Ano -> 160
    }
    if (num > 9) {
      return 200 + num;
    }
  }

  // Ensino Médio
  if (name.includes('médio') || name.includes('medio') || name.includes('em')) {
    return 500;
  }

  return 900;
}

/**
 * Sorts an array of turmas following strict pedagogical progression:
 * Mini Maternal -> Maternal -> Infantil 1 -> Infantil 2 -> 1º Ano -> 2º Ano -> ... -> 6º Ano -> etc.
 */
export function sortTurmasPedagogical(turmas: string[]): string[] {
  if (!Array.isArray(turmas)) return [];
  return [...turmas].sort((a, b) => {
    const weightA = getTurmaPedagogicalWeight(a);
    const weightB = getTurmaPedagogicalWeight(b);
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    // In the same segment, sort alphabetically (e.g., 'Azul' before 'Vermelho')
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

const ORDERED_STAGE_LABELS = [
  'Mini Maternal',
  'Maternal',
  'Infantil 1',
  'Infantil 2',
  '1º Ano',
  '2º Ano',
  '3º Ano',
  '4º Ano',
  '5º Ano',
  '6º Ano',
  '7º Ano',
  '8º Ano',
  '9º Ano',
];

function parseTurmaStage(turma: string): { stageIndex: number; color: string } {
  const t = (turma || '').trim();
  const lower = t.toLowerCase();

  const colorMatch = t.match(/\b(azul|vermelho|amarelo|verde|laranja|branco|rosa|ouro|prata)\b/i);
  const color = colorMatch ? (colorMatch[0].charAt(0).toUpperCase() + colorMatch[0].slice(1).toLowerCase()) : '';

  if (
    lower.includes('mini maternal') ||
    lower.includes('mini-maternal') ||
    lower.includes('minimaternal') ||
    lower.startsWith('mini')
  ) {
    return { stageIndex: 0, color };
  }
  if (lower.includes('maternal')) {
    return { stageIndex: 1, color };
  }
  if (
    lower.includes('infantil 1') ||
    (lower.includes('infantil i') && !lower.includes('infantil ii') && !lower.includes('infantil iii')) ||
    lower.includes('pré 1') ||
    lower.includes('pre 1') ||
    lower.includes('pré i') ||
    lower.includes('pre i')
  ) {
    return { stageIndex: 2, color };
  }
  if (
    lower.includes('infantil 2') ||
    (lower.includes('infantil ii') && !lower.includes('infantil iii')) ||
    lower.includes('pré 2') ||
    lower.includes('pre 2') ||
    lower.includes('pré ii') ||
    lower.includes('pre ii')
  ) {
    return { stageIndex: 3, color };
  }
  if (
    lower.includes('infantil 3') ||
    lower.includes('infantil iii') ||
    lower.includes('pré 3') ||
    lower.includes('pre 3')
  ) {
    return { stageIndex: 4, color };
  }

  const anoMatch = lower.match(/(\d+)\s*(?:º|°|o|ª|\.|\-)?\s*(?:ano|série|serie)?/);
  if (anoMatch) {
    const num = parseInt(anoMatch[1], 10);
    if (num >= 1 && num <= 9) {
      // 1º Ano -> stageIndex 4, 2º Ano -> 5, 3º Ano -> 6, ..., 6º Ano -> 9
      return { stageIndex: 3 + num, color };
    }
  }

  return { stageIndex: -1, color };
}

/**
 * Returns the next academic year class for rematriculation (e.g. 2026 -> 2027),
 * preserving segment progression and class color/branch (e.g. "1º Ano Azul" -> "2º Ano Azul").
 */
export function getNextAcademicTurma(currentTurma: string, availableTurmas?: string[]): string {
  if (!currentTurma) return availableTurmas?.[0] || '';
  const parsed = parseTurmaStage(currentTurma);
  if (parsed.stageIndex < 0) return currentTurma;

  const nextStageIndex = parsed.stageIndex + 1;
  if (nextStageIndex >= ORDERED_STAGE_LABELS.length) return currentTurma;

  const nextLabel = ORDERED_STAGE_LABELS[nextStageIndex];
  const list = availableTurmas && availableTurmas.length > 0 ? availableTurmas : [];

  // 1. Try to find an exact match with the same color in availableTurmas
  if (parsed.color && list.length > 0) {
    const exactColorMatch = list.find((t) => {
      const p = parseTurmaStage(t);
      return p.stageIndex === nextStageIndex && p.color.toLowerCase() === parsed.color.toLowerCase();
    });
    if (exactColorMatch) return exactColorMatch;
  }

  // 2. Try to find any turma matching the next stage in availableTurmas
  if (list.length > 0) {
    const stageMatch = list.find((t) => {
      const p = parseTurmaStage(t);
      return p.stageIndex === nextStageIndex;
    });
    if (stageMatch) return stageMatch;
  }

  // 3. Fallback: construct standard name
  return parsed.color ? `${nextLabel} ${parsed.color}` : nextLabel;
}

