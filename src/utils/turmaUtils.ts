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
