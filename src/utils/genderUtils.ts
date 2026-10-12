/**
 * Utilitários de Concordância e Flexão de Gênero para Nomes Brasileiros
 * Usado para saudações afetuosas e cordiais no Colégio Crescer.
 */

export type GenderType = 'masculino' | 'feminino';

export interface SalutationResult {
  gender: GenderType;
  salutation: 'querido' | 'querida';
  greeting: string;
  firstName: string;
}

/**
 * Detecta o gênero do primeiro nome com base em convenções da língua portuguesa,
 * listas explícitas e regras morfológicas.
 */
export function detectGenderFromName(rawName: string): GenderType {
  if (!rawName) return 'feminino';

  // Remove conteúdo entre parênteses como "Danyel Pereira (Flauta)" -> "Danyel Pereira"
  const clean = rawName.replace(/\(.*?\)/g, '').trim();
  const rawFirst = clean.split(/\s+/)[0] || '';
  const firstName = rawFirst
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!firstName) return 'feminino';

  // Lista explícita de nomes masculinos comuns
  const maleNames = new Set([
    'fernando',
    'danyel',
    'daniel',
    'joao',
    'jose',
    'pedro',
    'lucas',
    'mateus',
    'matheus',
    'gabriel',
    'rafael',
    'guilherme',
    'felipe',
    'gustavo',
    'rodrigo',
    'marcelo',
    'bruno',
    'leonardo',
    'tiago',
    'thiago',
    'arthur',
    'artur',
    'miguel',
    'davi',
    'david',
    'samuel',
    'carlos',
    'marcos',
    'andre',
    'antonio',
    'vicente',
    'henrique',
    'alexandre',
    'eduardo',
    'vitor',
    'victor',
    'caio',
    'igor',
    'otavio',
    'luiz',
    'luis',
    'jorge',
    'allan',
    'alan',
    'ricardo',
    'fabio',
    'diego',
    'sergio',
    'paulo',
    'humberto',
    'claudio',
    'cesar',
    'julio',
    'renato',
    'mauricio',
    'alex',
    'murilo',
    'bernardo',
    'heitor',
    'enzo',
    'lorenzo',
    'theo',
    'valter',
    'walter',
    'wagner',
    'clovis',
    'gilberto',
    'alberto',
    'roberto',
  ]);

  // Lista explícita de nomes femininos comuns
  const femaleNames = new Set([
    'maria',
    'ana',
    'thais',
    'tais',
    'beatriz',
    'raquel',
    'isabel',
    'isabela',
    'isabella',
    'juliana',
    'patricia',
    'amanda',
    'camila',
    'jessica',
    'fernanda',
    'bruna',
    'larissa',
    'paula',
    'simone',
    'monique',
    'daniele',
    'danielle',
    'michelle',
    'michele',
    'aline',
    'caroline',
    'cristiane',
    'denise',
    'viviane',
    'gisele',
    'ivone',
    'jaqueline',
    'rose',
    'elisangela',
    'solange',
    'janice',
    'irene',
    'marlene',
    'carol',
    'carmen',
    'karen',
    'jennifer',
    'ester',
    'helen',
    'ines',
    'ruth',
    'claudia',
    'monica',
    'daniela',
    'debora',
    'leticia',
    'natalia',
    'vanessa',
    'sabrina',
    'renata',
    'priscila',
    'flavia',
    'tatiana',
    'luciana',
    'mariana',
    'luana',
    'bianca',
    'rebeca',
    'helena',
    'alice',
    'lorena',
    'sophia',
    'sofia',
    'laura',
    'valentina',
    'manuela',
    'clarice',
    'eliana',
    'rosana',
    'valeria',
  ]);

  if (maleNames.has(firstName)) return 'masculino';
  if (femaleNames.has(firstName)) return 'feminino';

  // Regra geral morfológica do Português:
  // Terminações tipicamente masculinas
  if (
    firstName.endsWith('o') ||
    firstName.endsWith('os') ||
    firstName.endsWith('el') ||
    firstName.endsWith('or') ||
    firstName.endsWith('er') ||
    firstName.endsWith('ur') ||
    firstName.endsWith('on') ||
    firstName.endsWith('an')
  ) {
    return 'masculino';
  }

  // Terminações tipicamente femininas
  if (
    firstName.endsWith('a') ||
    firstName.endsWith('as') ||
    firstName.endsWith('is') ||
    firstName.endsWith('iz') ||
    firstName.endsWith('ah')
  ) {
    return 'feminino';
  }

  return 'feminino';
}

/**
 * Retorna a saudação cordial personalizada respeitando estritamente a flexão de gênero
 * Ex: 'Olá, querido Fernando!' ou 'Olá, querida Maria!'
 */
export function getSalutationForName(rawName: string): SalutationResult {
  const clean = (rawName || '').replace(/\(.*?\)/g, '').trim();
  const firstName = clean.split(/\s+/)[0] || 'Colaborador(a)';
  const gender = detectGenderFromName(firstName);
  const salutation: 'querido' | 'querida' = gender === 'masculino' ? 'querido' : 'querida';

  return {
    gender,
    salutation,
    greeting: `Olá, ${salutation} ${firstName}!`,
    firstName,
  };
}
