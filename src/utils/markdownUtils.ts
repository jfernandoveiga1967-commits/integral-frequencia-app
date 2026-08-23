/**
 * Utility for parsing and transforming Markdown & Icon tags ([icon: X], **bold**, _italic_, etc.)
 * for both PDF generation and UI rendering.
 */

export interface IconDefinition {
  key: string;
  label: string;
  symbol: string;
  lucideIconName: string;
}

export const ICON_DEFINITIONS: Record<string, IconDefinition> = {
  acolhimento: { key: 'acolhimento', label: 'Acolhimento', symbol: 'Acolhimento', lucideIconName: 'HeartHandshake' },
  recepcao: { key: 'recepcao', label: 'Recepção', symbol: 'Recepção', lucideIconName: 'HeartHandshake' },
  integracao: { key: 'integracao', label: 'Integração', symbol: 'Integração', lucideIconName: 'HeartHandshake' },
  boas_vindas: { key: 'boas_vindas', label: 'Boas-Vindas', symbol: 'Boas-Vindas', lucideIconName: 'HeartHandshake' },
  soninho: { key: 'soninho', label: 'Soninho', symbol: 'Soninho', lucideIconName: 'Moon' },
  sono: { key: 'sono', label: 'Sono / Descanso', symbol: 'Sono / Descanso', lucideIconName: 'Moon' },
  descanso: { key: 'descanso', label: 'Descanso', symbol: 'Descanso', lucideIconName: 'Moon' },
  soneca: { key: 'soneca', label: 'Soneca', symbol: 'Soneca', lucideIconName: 'Moon' },
  repouso: { key: 'repouso', label: 'Repouso', symbol: 'Repouso', lucideIconName: 'Moon' },
  almoco: { key: 'almoco', label: 'Almoço', symbol: 'Almoço', lucideIconName: 'Utensils' },
  refeicao: { key: 'refeicao', label: 'Refeição', symbol: 'Refeição', lucideIconName: 'Utensils' },
  comida: { key: 'comida', label: 'Alimentação', symbol: 'Alimentação', lucideIconName: 'Utensils' },
  lanche: { key: 'lanche', label: 'Lanche', symbol: 'Lanche', lucideIconName: 'Coffee' },
  merenda: { key: 'merenda', label: 'Merenda', symbol: 'Merenda', lucideIconName: 'Coffee' },
  cafe: { key: 'cafe', label: 'Café da Manhã/Tarde', symbol: 'Café da Manhã/Tarde', lucideIconName: 'Coffee' },
  hidratacao: { key: 'hidratacao', label: 'Hidratação', symbol: 'Hidratação', lucideIconName: 'Waves' },
  natacao: { key: 'natacao', label: 'Natação', symbol: 'Natação', lucideIconName: 'Waves' },
  piscina: { key: 'piscina', label: 'Piscina', symbol: 'Piscina', lucideIconName: 'Waves' },
  aqua: { key: 'aqua', label: 'Atividade Aquática', symbol: 'Atividade Aquática', lucideIconName: 'Waves' },
  hidro: { key: 'hidro', label: 'Hidroginástica', symbol: 'Hidroginástica', lucideIconName: 'Waves' },
  bale: { key: 'bale', label: 'Balé', symbol: 'Balé', lucideIconName: 'Sparkles' },
  ballet: { key: 'ballet', label: 'Ballet', symbol: 'Ballet', lucideIconName: 'Sparkles' },
  danca: { key: 'danca', label: 'Dança', symbol: 'Dança', lucideIconName: 'Music' },
  ritmo: { key: 'ritmo', label: 'Ritmos', symbol: 'Ritmos', lucideIconName: 'Music' },
  judo: { key: 'judo', label: 'Judô', symbol: 'Judô', lucideIconName: 'Award' },
  karate: { key: 'karate', label: 'Karatê', symbol: 'Karatê', lucideIconName: 'Award' },
  capoeira: { key: 'capoeira', label: 'Capoeira', symbol: 'Capoeira', lucideIconName: 'Award' },
  luta: { key: 'luta', label: 'Arte Marcial', symbol: 'Arte Marcial', lucideIconName: 'Award' },
  artes_marciais: { key: 'artes_marciais', label: 'Artes Marciais', symbol: 'Artes Marciais', lucideIconName: 'Award' },
  futebol: { key: 'futebol', label: 'Futebol', symbol: 'Futebol', lucideIconName: 'Trophy' },
  futsal: { key: 'futsal', label: 'Futsal', symbol: 'Futsal', lucideIconName: 'Trophy' },
  esporte: { key: 'esporte', label: 'Esportes', symbol: 'Esportes', lucideIconName: 'Trophy' },
  ginastica: { key: 'ginastica', label: 'Ginástica', symbol: 'Ginástica', lucideIconName: 'Activity' },
  circo: { key: 'circo', label: 'Circo', symbol: 'Circo', lucideIconName: 'Activity' },
  alongamento: { key: 'alongamento', label: 'Alongamento', symbol: 'Alongamento', lucideIconName: 'Activity' },
  flauta: { key: 'flauta', label: 'Flauta', symbol: 'Flauta', lucideIconName: 'Music2' },
  musica: { key: 'musica', label: 'Música', symbol: 'Música', lucideIconName: 'Music2' },
  canto: { key: 'canto', label: 'Canto / Coral', symbol: 'Canto / Coral', lucideIconName: 'Music2' },
  xadrez: { key: 'xadrez', label: 'Xadrez', symbol: 'Xadrez', lucideIconName: 'Gamepad2' },
  jogos: { key: 'jogos', label: 'Jogos de Mesa', symbol: 'Jogos de Mesa', lucideIconName: 'Gamepad2' },
  robotica: { key: 'robotica', label: 'Robótica', symbol: 'Robótica', lucideIconName: 'Cpu' },
  maker: { key: 'maker', label: 'Cultura Maker', symbol: 'Cultura Maker', lucideIconName: 'Cpu' },
  artes: { key: 'artes', label: 'Artes', symbol: 'Artes', lucideIconName: 'Palette' },
  pintura: { key: 'pintura', label: 'Pintura', symbol: 'Pintura', lucideIconName: 'Palette' },
  desenho: { key: 'desenho', label: 'Desenho', symbol: 'Desenho', lucideIconName: 'Palette' },
  atelie: { key: 'atelie', label: 'Ateliê Criativo', symbol: 'Ateliê Criativo', lucideIconName: 'Palette' },
  artesanato: { key: 'artesanato', label: 'Artesanato', symbol: 'Artesanato', lucideIconName: 'Scissors' },
  teatro: { key: 'teatro', label: 'Teatro', symbol: 'Teatro', lucideIconName: 'BookOpen' },
  leitura: { key: 'leitura', label: 'Leitura', symbol: 'Leitura', lucideIconName: 'BookOpen' },
  livro: { key: 'livro', label: 'Biblioteca', symbol: 'Biblioteca', lucideIconName: 'BookOpen' },
  literatura: { key: 'literatura', label: 'Literatura Infantil', symbol: 'Literatura Infantil', lucideIconName: 'BookOpen' },
  licao: { key: 'licao', label: 'Lição de Casa', symbol: 'Lição de Casa', lucideIconName: 'BookMarked' },
  licao_de_casa: { key: 'licao_de_casa', label: 'Lição de Casa', symbol: 'Lição de Casa', lucideIconName: 'BookMarked' },
  tarefa: { key: 'tarefa', label: 'Tarefa Escolar', symbol: 'Tarefa Escolar', lucideIconName: 'BookMarked' },
  estudo: { key: 'estudo', label: 'Estudo Orientado', symbol: 'Estudo Orientado', lucideIconName: 'BookMarked' },
  higiene: { key: 'higiene', label: 'Higiene', symbol: 'Higiene', lucideIconName: 'Smile' },
  banho: { key: 'banho', label: 'Banho', symbol: 'Banho', lucideIconName: 'Smile' },
  escovacao: { key: 'escovacao', label: 'Escovação', symbol: 'Escovação', lucideIconName: 'Smile' },
  parque: { key: 'parque', label: 'Parquinho', symbol: 'Parquinho', lucideIconName: 'Sun' },
  parquinho: { key: 'parquinho', label: 'Parquinho', symbol: 'Parquinho', lucideIconName: 'Sun' },
  patio: { key: 'patio', label: 'Pátio', symbol: 'Pátio', lucideIconName: 'Sun' },
  ar_livre: { key: 'ar_livre', label: 'Ar Livre', symbol: 'Ar Livre', lucideIconName: 'Sun' },
  recreacao: { key: 'recreacao', label: 'Recreação', symbol: 'Recreação', lucideIconName: 'Smile' },
  brincadeira: { key: 'brincadeira', label: 'Brincadeiras', symbol: 'Brincadeiras', lucideIconName: 'Smile' },
  rotina: { key: 'rotina', label: 'Rotina', symbol: 'Rotina', lucideIconName: 'Clock' },
  horario: { key: 'horario', label: 'Horário', symbol: 'Horário', lucideIconName: 'Clock' },
};

/**
 * Normalizes an icon tag key (e.g. "acolhimento", "Soninho", "artes-marciais")
 */
export function normalizeIconKey(rawKey: string): string {
  if (!rawKey) return '';
  return rawKey
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-]+/g, '_')
    .trim();
}

/**
 * Parses and strips all [icon: X] tags, markdown tags, and formatting artifacts
 * producing clean, professional text ready for PDF generation.
 */
export function processMarkdownAndIconsForPDF(rawText: string | undefined | null): string {
  if (!rawText) return '';
  let text = String(rawText);

  // 1. Process all forms of [icon: tag_name] or [tag: ...]
  text = text.replace(/\[(?:icon|tag|icone):\s*([^\]]+)\]/gi, (_, iconKey) => {
    const cleanKey = normalizeIconKey(iconKey);
    const def = ICON_DEFINITIONS[cleanKey];
    if (def) {
      return def.label;
    }
    const formatted = iconKey
      .trim()
      .replace(/[_\-]+/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    return formatted;
  });

  // Remove any remaining generic bracket tags e.g. [qualquer_tag]
  text = text.replace(/\[[a-zA-Z0-9_\-\s:]+\]/g, '');

  // 2. Process bold-italic: ***text***, ___text___, **_text_**, _**text**_
  text = text.replace(/(\*\*\*|___)(.*?)\1/g, '$2');
  text = text.replace(/\*\*_(.*?)_\*\*/g, '$1');
  text = text.replace(/_\*\*(.*?)\*\*_/, '$1');
  text = text.replace(/\*_(.*?)_\*/g, '$1');
  text = text.replace(/_\*(.*?)\*_/g, '$1');

  // 3. Process bold: **text**, __text__
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');

  // 4. Process italic: *text*, _text_
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');

  // 5. Process strikethrough: ~~text~~
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 6. Process inline code: `text`
  text = text.replace(/`([^`]+)`/g, '$1');

  // 7. Process markdown links: [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 8. Process leading markdown headers (#, ##, ###)
  text = text.replace(/^#+\s*/gm, '');

  // 9. Remove any remaining stray formatting markers: **, __, *, _, ~~, `
  text = text.replace(/(\*\*|__|\*|_|~~|`)/g, '');

  // 10. Strip emoji symbols to keep PDFs purely clean and professional
  text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '');

  // 11. Clean duplicate consecutive words (e.g. "Acolhimento Acolhimento" -> "Acolhimento")
  const words = text.trim().split(/\s+/).filter(Boolean);
  const dedupedWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      dedupedWords.push(words[i]);
    }
  }
  text = dedupedWords.join(' ');

  return text.trim();
}
