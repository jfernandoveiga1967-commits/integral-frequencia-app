import { ActivityItem, DayOfWeek, SemanarioCategory, SemanarioPlan, WeekInfo } from '../types';
import { getTurmaPedagogicalWeight } from './turmaUtils';
import { loadActivities } from './storageUtils';
import { ACTIVITIES_LIST } from '../data/initialData';

export const CATEGORIA_PROJETO = 'Projeto';

/**
 * Retorna as categorias / modalidades permitidas para uma turma específica.
 * Consome a lista oficial unificada de atividades cadastradas no sistema.
 * A modalidade "Projeto" só é habilitada para turmas do 3º ao 6º Ano (e segmentos superiores).
 * Mantém sempre ordenação alfabética estrita de A a Z.
 */
export function getCategoriesForTurma(turmaName: string, activitiesList?: ActivityItem[]): string[] {
  const isProjetoAllowed = isTurmaEligibleForProjeto(turmaName);
  
  let rawNames: string[] = [];
  if (activitiesList && activitiesList.length > 0) {
    rawNames = activitiesList.map((a) => (a.name || a.id).trim());
  } else {
    try {
      const stored = loadActivities();
      if (stored && stored.length > 0) {
        rawNames = stored.map((a) => (a.name || a.id).trim());
      } else {
        rawNames = ACTIVITIES_LIST.map((a) => (a.name || a.id).trim());
      }
    } catch {
      rawNames = ACTIVITIES_LIST.map((a) => (a.name || a.id).trim());
    }
  }

  // Deduplicate and filter "Projeto" for lower grades if not eligible
  const set = new Set<string>();
  rawNames.forEach((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'projeto' && !isProjetoAllowed) {
      return;
    }
    set.add(trimmed);
  });

  const categories = Array.from(set);

  // Ordenação alfabética estrita em português (A a Z)
  return categories.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Retorna todas as categorias cadastradas no sistema em ordem alfabética estrita (A a Z).
 */
export function getAllCategoriesAlphabetical(activitiesList?: ActivityItem[]): string[] {
  let rawNames: string[] = [];
  if (activitiesList && activitiesList.length > 0) {
    rawNames = activitiesList.map((a) => (a.name || a.id).trim());
  } else {
    try {
      const stored = loadActivities();
      if (stored && stored.length > 0) {
        rawNames = stored.map((a) => (a.name || a.id).trim());
      } else {
        rawNames = ACTIVITIES_LIST.map((a) => (a.name || a.id).trim());
      }
    } catch {
      rawNames = ACTIVITIES_LIST.map((a) => (a.name || a.id).trim());
    }
  }

  const set = new Set<string>();
  rawNames.forEach((name) => {
    const trimmed = name.trim();
    if (trimmed) set.add(trimmed);
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Verifica se a turma é de 3º Ano ou superior (3º Ano, 4º Ano, 5º Ano, 6º Ano...)
 */
export function isTurmaEligibleForProjeto(turmaName: string): boolean {
  if (!turmaName) return false;
  const weight = getTurmaPedagogicalWeight(turmaName);
  // 3º Ano tem peso ~130. Turmas do 3º ao 6º ano tem peso >= 130
  return weight >= 130;
}

/**
 * Cores e ícones temáticos para cada categoria ou modalidade
 */
export function getCategoryBadgeStyle(category: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  const cat = (category || '').toLowerCase();

  if (cat.includes('natação') || cat.includes('natacao') || cat.includes('piscina') || cat.includes('aquática')) {
    return { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-300', dot: 'bg-sky-500' };
  }
  if (cat.includes('balé') || cat.includes('bale')) {
    return { bg: 'bg-pink-50', text: 'text-pink-800', border: 'border-pink-300', dot: 'bg-pink-500' };
  }
  if (cat.includes('judô') || cat.includes('judo') || cat.includes('marcial') || cat.includes('luta')) {
    return { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', dot: 'bg-amber-600' };
  }
  if (cat.includes('futebol') || cat.includes('esporte') || cat.includes('quadra')) {
    return { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-300', dot: 'bg-emerald-600' };
  }
  if (cat.includes('dança') || cat.includes('danca')) {
    return { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-300', dot: 'bg-purple-600' };
  }
  if (cat.includes('flauta') || cat.includes('música') || cat.includes('musica') || cat.includes('musicalização') || cat.includes('musicalizacao') || cat.includes('ritmo')) {
    return { bg: 'bg-teal-50', text: 'text-teal-900', border: 'border-teal-300', dot: 'bg-teal-600' };
  }
  if (cat.includes('ginástica') || cat.includes('ginastica')) {
    return { bg: 'bg-indigo-50', text: 'text-indigo-900', border: 'border-indigo-300', dot: 'bg-indigo-600' };
  }
  if (cat.includes('robótica') || cat.includes('robotica') || cat.includes('computacional') || cat.includes('tecnologia')) {
    return { bg: 'bg-cyan-50', text: 'text-cyan-900', border: 'border-cyan-300', dot: 'bg-cyan-600' };
  }
  if (cat.includes('devocional') || cat.includes('valores') || cat.includes('espiritualidade')) {
    return { bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-300', dot: 'bg-rose-600' };
  }
  if (cat.includes('almoço') || cat.includes('almoco') || cat.includes('lanche') || cat.includes('culinária') || cat.includes('culinaria')) {
    return { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-300', dot: 'bg-orange-600' };
  }
  if (cat.includes('acolhimento') || cat.includes('roda')) {
    return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' };
  }
  if (cat.includes('artes') || cat.includes('expressão') || cat.includes('expressao') || cat.includes('pintura')) {
    return { bg: 'bg-fuchsia-50', text: 'text-fuchsia-800', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500' };
  }
  if (cat.includes('contação') || cat.includes('contacao') || cat.includes('histórias') || cat.includes('historias') || cat.includes('literatura')) {
    return { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500' };
  }
  if (cat.includes('psicomotora') || cat.includes('movimento') || cat.includes('circuito')) {
    return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  }
  if (cat.includes('jogos') || cat.includes('tabuleiro') || cat.includes('raciocínio') || cat.includes('raciocinio') || cat.includes('xadrez')) {
    return { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500' };
  }
  if (cat.includes('oficina') || cat.includes('maker') || cat.includes('ciências') || cat.includes('ciencias')) {
    return { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', dot: 'bg-teal-500' };
  }
  if (cat.includes('projeto')) {
    return { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-600' };
  }
  if (cat.includes('recreação') || cat.includes('recreacao') || cat.includes('brincadeiras') || cat.includes('parque')) {
    return { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200', dot: 'bg-cyan-500' };
  }
  if (cat.includes('relaxamento') || cat.includes('calma') || cat.includes('sono') || cat.includes('soninho') || cat.includes('descanso')) {
    return { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500' };
  }
  if (cat.includes('tarefas') || cat.includes('estudo') || cat.includes('lição') || cat.includes('licao') || cat.includes('dever')) {
    return { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500' };
  }
  if (cat.includes('rotina')) {
    return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-600' };
  }

  return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-500' };
}

export function getStatusStyle(status: 'realizada' | 'pendente' | 'substituida'): {
  label: string;
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
} {
  switch (status) {
    case 'realizada':
      return {
        label: 'Realizada',
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        text: 'text-emerald-800',
        border: 'border-emerald-400',
        badgeBg: 'bg-emerald-500',
      };
    case 'substituida':
      return {
        label: 'Substituída',
        bg: 'bg-amber-50 text-amber-900 border-amber-300',
        text: 'text-amber-900',
        border: 'border-amber-400',
        badgeBg: 'bg-amber-500',
      };
    case 'pendente':
    default:
      return {
        label: 'Pendente',
        bg: 'bg-slate-100 text-slate-700 border-slate-300',
        text: 'text-slate-700',
        border: 'border-slate-300',
        badgeBg: 'bg-slate-400',
      };
  }
}

// Storage local keys
const SEMANARIO_STORAGE_KEY = 'integral_semanario_plans_v1';

export function loadSemanarioPlans(): SemanarioPlan[] {
  try {
    const raw = localStorage.getItem(SEMANARIO_STORAGE_KEY);
    if (!raw) return getInitialSamplePlans();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return getInitialSamplePlans();
  } catch (err) {
    console.error('Erro ao carregar planos do Semanário do localStorage:', err);
    return getInitialSamplePlans();
  }
}

export function saveSemanarioPlans(plans: SemanarioPlan[]): void {
  try {
    localStorage.setItem(SEMANARIO_STORAGE_KEY, JSON.stringify(plans));
  } catch (err) {
    console.error('Erro ao salvar planos do Semanário no localStorage:', err);
  }
}

/**
 * Amostras Pedagógicas Iniciais para demonstração e povoamento da grade
 */
export function getInitialSamplePlans(): SemanarioPlan[] {
  const now = new Date();
  const year = now.getFullYear();

  return [
    {
      id: 'sem_plan_init_1',
      turma: '1º Ano Azul',
      weekNumber: 35,
      year: year,
      date: `${year}-08-24`,
      dayOfWeek: 'segunda',
      timeSlot: '13:30 - 14:30',
      category: 'Acolhimento / Roda de Conversa',
      title: 'Roda das Emoções & Caixa dos Sentimentos',
      objectives: 'Estimular a autorregulação emocional, a escuta ativa e a empatia no retorno das atividades do final de semana.',
      development: '1. Acolhimento em círculo na esteira pedagógica.\n2. Passagem do "Bichinho da Voz": cada criança compartilha um momento marcante do fim de semana.\n3. Apresentação do termômetro das emoções (alegria, saudade, calma, cansaço).',
      materials: 'Bichinho de pelúcia (voz), cartazes do termômetro das emoções e almofadas.',
      teacherName: 'Monitora Integral',
      status: 'realizada',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sem_plan_init_2',
      turma: '1º Ano Azul',
      weekNumber: 35,
      year: year,
      date: `${year}-08-24`,
      dayOfWeek: 'segunda',
      timeSlot: '15:00 - 16:00',
      category: 'Estimulação Psicomotora e Movimento',
      title: 'Circuito Sensorial dos Pés e Equilíbrio',
      objectives: 'Desenvolver a consciência corporal, motricidade ampla, equilíbrio estático e dinâmico e integração sensorial.',
      development: '1. Aquecimento lúdico com música corporal.\n2. Percurso com cones, cordas, tapetes texturizados (folhas, plástico bolha, esponja) e trave de equilíbrio.\n3. Relaxamento no final com respiração da flor e da vela.',
      materials: 'Cones, cordas, tapetes táteis texturizados, caixas baixas.',
      teacherName: 'Monitora Integral',
      status: 'realizada',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sem_plan_init_3',
      turma: '1º Ano Azul',
      weekNumber: 35,
      year: year,
      date: `${year}-08-25`,
      dayOfWeek: 'terca',
      timeSlot: '13:30 - 14:30',
      category: 'Contação de Histórias e Literatura',
      title: 'Varal de Histórias: "O Monstro das Cores"',
      objectives: 'Incentivar o gosto pela leitura, ampliação do vocabulário e reflexão sobre sentimentos.',
      development: '1. Leitura mediada do livro utilizando fantoches de feltro das cores.\n2. Classificação dos potes de sentimentos pelas crianças.\n3. Desenho coletivo do próprio monstrinho alegre.',
      materials: 'Livro físico, fantoches de feltro, potes plásticos transparentes e novelos de lã colorida.',
      teacherName: 'Monitora Integral',
      status: 'realizada',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sem_plan_init_4',
      turma: '1º Ano Azul',
      weekNumber: 35,
      year: year,
      date: `${year}-08-26`,
      dayOfWeek: 'quarta',
      timeSlot: '14:00 - 15:00',
      category: 'Oficina Pedagógica e Criativa',
      title: 'Modelagem Criativa com Argila e Elementos Naturais',
      objectives: 'Trabalhar a coordenação motora fina, tato tridimensional e criatividade exploratória.',
      development: '1. Manipulação livre da argila úmida.\n2. Impressão de texturas com galhos, folhas secas e sementes recolhidas no pátio escolar.\n3. Criação de esculturas de animais da natureza.',
      materials: 'Argila escolar, folhas, gravetos, sementes, palitos e água em borrifadores.',
      teacherName: 'Monitora Integral',
      status: 'pendente',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sem_plan_init_5',
      turma: '3º Ano Azul',
      weekNumber: 35,
      year: year,
      date: `${year}-08-27`,
      dayOfWeek: 'quinta',
      timeSlot: '14:30 - 15:30',
      category: 'Projeto',
      title: 'Projeto Horta & Sustentabilidade: Germinação de Sementes',
      objectives: 'Compreender o ciclo de vida das plantas, responsabilidade ecológica e cultivo de hortaliças.',
      development: '1. Estudo das sementes de alface e rúcula.\n2. Preparação dos vasinhos biodegradáveis com terra adubada.\n3. Rega controlada e confecção da tabela de observação diária de crescimento.',
      materials: 'Sementes, copinhos de jornal, terra adubada, regadores e etiquetas de identificação.',
      teacherName: 'Monitora Integral',
      status: 'pendente',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sem_plan_init_6',
      turma: '2º Ano Azul',
      weekNumber: 35,
      year: year,
      date: `${year}-08-28`,
      dayOfWeek: 'sexta',
      timeSlot: '14:00 - 15:00',
      category: 'Jogos de Tabuleiro e Raciocínio',
      title: 'Torneio Cooperativo de Dominó e Jogo da Memória Gigante',
      objectives: 'Desenvolver o raciocínio lógico-matemático, respeito às regras e espírito de cooperação.',
      development: '1. Divisão em pequenas equipes de 4 alunos.\n2. Rodízio de jogos de mesa clássicos (dominó, dama simplificada, ludo).\n3. Roda de fechamento destacando os momentos de ajuda mútua.',
      materials: 'Jogos de dominó, memórias gigantes ilustradas, tapete de jogos.',
      teacherName: 'Monitora Integral',
      status: 'substituida',
      substitutionReason: 'Substituído por Recreação ao Ar Livre devido ao dia ensolarado e atividade integrada comemorativa no pátio.',
      createdAt: new Date().toISOString(),
    },
  ];
}

/**
 * Gerador de sugestão pedagógica com IA (Fallback offline caso a API esteja sem chave ou instável)
 */
export function generateCuratedProposal(
  turma: string,
  category: string,
  theme?: string
): {
  title: string;
  objectives: string;
  development: string;
  materials: string;
} {
  const cleanTheme = (theme || '').trim();

  if (category.includes('Natação') || category.includes('Natacao') || category.includes('piscina') || category.includes('aquática')) {
    return {
      title: cleanTheme ? `Natação Educativa: ${cleanTheme}` : 'Circuito Aquático: Respiração, Flutuação e Propulsão Lúdica',
      objectives: 'Desenvolver a segurança no meio aquático, controle respiratório, coordenação motora dos membros e autonomia na água.',
      development: '1. Entrada orientada na piscina e aquecimento articular na borda.\n2. Exercícios lúdicos de respiração (bolhinhas) e flutuação em estrela com pranchinhas.\n3. Percurso com propulsão de pernas e mergulho seguro para resgate de argolas.',
      materials: 'Pranchas de EVA, espaguetes flutuadores, argolas de mergulho, óculos e toucas.',
    };
  }

  if (category.includes('Balé') || category.includes('Bale')) {
    return {
      title: cleanTheme ? `Expressão no Balé: ${cleanTheme}` : 'Iniciação ao Balé Clássico: Postura, Flexibilidade e Graça',
      objectives: 'Desenvolver a postura corporal, musicalidade, noções de ritmo clássico e coordenação espacial.',
      development: '1. Aquecimento no chão com flex e ponta dos pés e borboletinha.\n2. Exercícios de barra e centro com posições fundamentais de braços e pés (1ª e 2ª posição).\n3. Coreografia lúdica simulando conto de fadas e reverência final.',
      materials: 'Sapatilhas, espelho de sala de dança, lenços de seda coloridos e música clássica.',
    };
  }

  if (category.includes('Judô') || category.includes('Judo') || category.includes('Marcial')) {
    return {
      title: cleanTheme ? `Caminho Suave: ${cleanTheme}` : 'Judô Pedagógico: Disciplina, Amortecimento de Quedas (Ukemi) e Respeito',
      objectives: 'Trabalhar o autocontrole, respeito mútuo, equilíbrio corporal, noção de segurança nas quedas e espírito esportivo.',
      development: '1. Cerimonial de abertura (Rei) no tatame e aquecimento dinâmico com rolamentos.\n2. Prática dos amortecimentos de queda (Ushiro-Ukemi) em superfície macia.\n3. Jogos de equilíbrio em duplas respeitando a pegada no kimono (Kumi-kata) e saudação de encerramento.',
      materials: 'Tatame amortecedor, kimonos, faixas e cronômetro lúdico.',
    };
  }

  if (category.includes('Futebol') || category.includes('Esporte')) {
    return {
      title: cleanTheme ? `Clube do Futebol: ${cleanTheme}` : 'Futebol Cooperativo: Domínio de Bola, Passe Preciso e Jogo Coletivo',
      objectives: 'Aprimorar a coordenação motora ampla, visão de jogo, precisão nos passes e espírito de equipe.',
      development: '1. Aquecimento lúdico com corrida e controle da bola entre cones.\n2. Treinamento de passe e finalização em mini-gols com rodízio de funções.\n3. Mini-jogo cooperativo com foco na troca de passes e respeito às regras.',
      materials: 'Bolas de futebol infantil, cones demarcadores, coletes coloridos e mini-traves.',
    };
  }

  if (category.includes('Dança') || category.includes('Danca')) {
    return {
      title: cleanTheme ? `Oficina de Ritmos: ${cleanTheme}` : 'Dança & Expressão: Ritmos Brasileiros e Consciência Corporal',
      objectives: 'Estimular a liberdade expressiva, percepção rítmica, lateralidade e integração em grupo.',
      development: '1. Aquecimento corporal com isolamento de movimentos (cabeça, ombros, quadris).\n2. Exploração de movimentos de dança com fitas e panos ao som de ritmos brasileiros.\n3. Montagem de uma sequência coreográfica simples e relaxamento no solo.',
      materials: 'Fitas de cetim, aparelho de som, pandeiro e colchonetes.',
    };
  }

  if (category.includes('Flauta') || category.includes('Instrumentos')) {
    return {
      title: cleanTheme ? `Musicalização com Flauta: ${cleanTheme}` : 'Flauta Doce: Emissão Sonora, Digitação e Pequenas Melodias',
      objectives: 'Desenvolver a respiração diafragmática, afinação, coordenação motora fina e leitura musical básica.',
      development: '1. Exercícios respiratórios e aquecimento sonoro com notas longas (Si, Lá, Sol).\n2. Treinamento da digitação correta dos furos com auxílio do dedilhado visual.\n3. Execução em uníssono de uma melodia folclórica infantil.',
      materials: 'Flautas doces germânicas, pastas com partituras simplificadas e metrônomo.',
    };
  }

  if (category.includes('Ginástica') || category.includes('Ginastica')) {
    return {
      title: cleanTheme ? `Ginástica Artística: ${cleanTheme}` : 'Ginástica e Acrobacias: Rolamentos, Estrelas e Equilíbrio',
      objectives: 'Desenvolver a flexibilidade, força muscular funcional, coordenação acrobática e segurança corporal.',
      development: '1. Aquecimento dinâmico e alongamento dos grandes grupos musculares.\n2. Estações de ginástica de solo: vela, ponte assistida e rolamento para frente em plano inclinado.\n3. Caminhada em trave baixa com controle postural.',
      materials: 'Colchões tipo plinth, trave de solo baixa, fita e bolas de ginástica rítmica.',
    };
  }

  if (category.includes('Robótica') || category.includes('Robotica') || category.includes('Computacional')) {
    return {
      title: cleanTheme ? `Robótica Educacional: ${cleanTheme}` : 'Mundo Maker: Construção de Mecanismos e Pensamento Computacional',
      objectives: 'Estimular o raciocínio lógico, noções de engrenagens e alavancas, resolução colaborativa de problemas e tecnologia.',
      development: '1. Apresentação do desafio: construir um mecanismo motorizado simples (ex: catavento ou carrinho).\n2. Montagem em duplas utilizando peças de encaixe e engrenagens.\n3. Teste de funcionamento, ajustes mecânicos e demonstração coletiva.',
      materials: 'Kits de blocos estruturais/robótica, motores didáticos, baterias e manuais de montagem.',
    };
  }

  if (category.includes('Devocional') || category.includes('Valores') || category.includes('Espiritualidade')) {
    return {
      title: cleanTheme ? `Momento de Valores: ${cleanTheme}` : 'Momento Devocional: Gratidão, Solidariedade e Amor ao Próximo',
      objectives: 'Cultivar sentimentos de gratidão, empatia, respeito às diferenças e reflexão sobre a bondade no dia a dia.',
      development: '1. Acomodação em roda com música suave de louvor/reflexão.\n2. Leitura dialogada de uma história de princípios (ex: o Bom Samaritano ou o Valor da Amizade).\n3. Dinâmica da "Árvore da Gratidão": cada criança cola uma folha com um agradecimento sincero.',
      materials: 'Mural da árvore, folhas de papel colorido, canetinhas, Bíblia ilustrada e som ambiente.',
    };
  }

  if (category.includes('Almoço') || category.includes('Almoco') || category.includes('Refeição')) {
    return {
      title: cleanTheme ? `Educação Nutricional: ${cleanTheme}` : 'Almoço Saudável & Autonomia: Cores no Prato e Higiene Bucal',
      objectives: 'Incentivar o consumo de saladas e legumes, a mastigação consciente, a postura à mesa e a higiene após as refeições.',
      development: '1. Higienização das mãos antes de entrar no refeitório.\n2. Incentivo à experimentação de novos vegetais e organização do próprio prato.\n3. Escovação dental orientada e descarte correto de resíduos.',
      materials: 'Refeitório escolar, pratos, talheres adequados, kits de escovação dental e espelhos.',
    };
  }

  if (category.includes('Acolhimento') || category.includes('Roda')) {
    return {
      title: cleanTheme ? `Roda de Acolhimento: ${cleanTheme}` : 'Roda de Acolhimento & Cápsula do Afeto',
      objectives: 'Estimular a oralidade, o pertencimento ao grupo escolar, o respeito aos turnos de fala e a conexão afetiva.',
      development: '1. Recepção calorosa com música suave e acomodação em círculo.\n2. Dinâmica do "Espelho Mágico": cada aluno diz uma qualidade que admira no colega.\n3. Apresentação da rotina prevista para o dia e combinados da turma.',
      materials: 'Almofadas, caixa decorada, cartazes de combinados e música ambiente.',
    };
  }

  if (category.includes('Artes') || category.includes('Expressão')) {
    return {
      title: cleanTheme ? `Ateliê de Artes: ${cleanTheme}` : 'Ateliê Criativo: Pintura com Pigmentos Naturais',
      objectives: 'Explorar texturas, cores primárias/secundárias, motricidade fina e liberdade expressiva.',
      development: '1. Apresentação de pós naturais (açafrão, café, beterraba, espinafre) dissolvidos em água e cola.\n2. Experimentação livre em folhas encorpadas usando pincéis, esponjas e dedinhos.\n3. Exposição dos trabalhos no varal pedagógico da sala.',
      materials: 'Papel canson A3, tintas naturais/tempera, pincéis chatos, potes de água e panos.',
    };
  }

  if (category.includes('Contação') || category.includes('Histórias') || category.includes('Literatura')) {
    return {
      title: cleanTheme ? `Viagem Literária: ${cleanTheme}` : 'Teatro de Sombras & Contação de Lendas Brasileiras',
      objectives: 'Despertar o imaginário, interpretação narrativa e valorização da cultura popular brasileira.',
      development: '1. Ambientação com meia-luz e tela de tecido iluminada por lanterna.\n2. Narração da história com silhuetas de personagens em varetas.\n3. Convite para que as crianças assumam as sombras e recriem o final da narrativa.',
      materials: 'Tecido branco esticado, lanterna potente, silhuetas em papel cartão e varetas.',
    };
  }

  if (category.includes('Culinária') || category.includes('Nutricional')) {
    return {
      title: cleanTheme ? `Oficina Nutricional: ${cleanTheme}` : 'Oficina Masterchef Mirim: Espetinhos de Frutas Divertidos',
      objectives: 'Promover hábitos alimentares saudáveis, noções de higiene e classificação de alimentos por cores e sabores.',
      development: '1. Higienização das mãos e colocação de toucas higiênicas.\n2. Identificação das frutas (banana, morango, uva, manga) e suas vitaminas.\n3. Montagem dos espetinhos coloridos e degustação coletiva.',
      materials: 'Frutas frescas da estação, tábuas plásticas, cortadores lúdicos, pratinhos e toucas.',
    };
  }

  if (category.includes('Psicomotora') || category.includes('Movimento')) {
    return {
      title: cleanTheme ? `Circuito Motor: ${cleanTheme}` : 'Circuito de Agilidade, Salto e Coordenação Visomotora',
      objectives: 'Aprimorar o equilíbrio, noções espaço-temporais, lateralidade e cooperação em equipe.',
      development: '1. Aquecimento com corrida lúdica com comandos de "estátua" e "troca de direção".\n2. Estações motoras: zig-zag em cones, salto de mini-obstáculos e passagem por túnel de tecido.\n3. Alongamento e respiração consciente.',
      materials: 'Cones, arcos (bambolês), cordas elásticas, túnel lúdico e colchonetes.',
    };
  }

  if (category.includes('Jogos') || category.includes('Raciocínio')) {
    return {
      title: cleanTheme ? `Clube do Raciocínio: ${cleanTheme}` : 'Desafio dos Blocos Lógicos & Tangram Gigante',
      objectives: 'Desenvolver a percepção espacial, reconhecimento de formas geométricas e resolução de problemas.',
      development: '1. Apresentação das 7 peças do Tangram e suas propriedades geométricas.\n2. Desafio individual de reproduzir cartas-modelo de animais e objetos.\n3. Desafio em dupla: criação de uma figura inédita.',
      materials: 'Kits de Tangram em EVA ou madeira, cartas de desafios graduados e cronômetro lúdico.',
    };
  }

  if (category.includes('Música') || category.includes('Musicalização') || category.includes('Ritmo')) {
    return {
      title: cleanTheme ? `Banda do Integral: ${cleanTheme}` : 'Oficina de Percussão Corporal e Paisagens Sonoras',
      objectives: 'Trabalhar a percepção auditiva, pulsação rítmica, coordenação motora bilateral e sincronia.',
      development: '1. Jogo dos sons: identificação de timbres com olhos vendados.\n2. Construção de células rítmicas com palmas, pés e estalos.\n3. Acompanhamento de uma canção folclórica utilizando instrumentos de percussão leve.',
      materials: 'Chocalhos, pandeiros infantis, triângulos, clavas e caixas de som.',
    };
  }

  if (category.includes('Projeto')) {
    return {
      title: cleanTheme ? `Projeto Integrador: ${cleanTheme}` : 'Projeto Científico: Laboratório de Experiências Práticas',
      objectives: 'Fomentar a curiosidade científica, metodologia investigativa, formulação de hipóteses e registro de resultados.',
      development: '1. Pergunta disparadora e levantamento de hipóteses pelos alunos.\n2. Execução do experimento seguro em grupos (ex: densidade de líquidos ou germinação acelerada).\n3. Registro das conclusões em diário de bordo com desenhos e gráficos.',
      materials: 'Tubos de ensaio plásticos, corantes alimentares, lupa, cadernos de anotações e réguas.',
    };
  }

  if (category.includes('Recreação') || category.includes('Brincadeiras')) {
    return {
      title: cleanTheme ? `Gincana Recreativa: ${cleanTheme}` : 'Gincana Cooperativa: Jogos Tradicionais de Rua',
      objectives: 'Incentivar o brincar livre e dirigido, integração social, respeito às regras e superação de desafios.',
      development: '1. Resgate de brincadeiras tradicionais: queimada cooperativa, corrida de saco e bandeirinha.\n2. Foco na participação de todos sem exclusão ou eliminação permanente.\n3. Roda de água e conversa sobre espírito esportivo.',
      materials: 'Bolas de borracha macia, sacos de estopa/tecido, cones e fita crepe.',
    };
  }

  if (category.includes('Relaxamento') || category.includes('Calma')) {
    return {
      title: cleanTheme ? `Momento Zen: ${cleanTheme}` : 'Jornada da Calma: Yoga Lúdico & Massagem com Bolinhas',
      objectives: 'Promover a desaceleração, redução do estresse diário, autocuidado e consciência respiratória.',
      development: '1. Posturas lúdicas de yoga inspiradas em animais (gato, cachorro, borboleta, árvore).\n2. Automassagem nos pés e costas com bolinhas de borracha texturizadas.\n3. Relaxamento guiado com som de chuva e óleo essencial de lavanda no difusor.',
      materials: 'Colchonetes, bolinhas de borracha, difusor de aromas e playlist relaxante.',
    };
  }

  // Padrão / Tarefas / Outros
  return {
    title: cleanTheme ? `Estudo & Prática: ${cleanTheme}` : 'Plantão de Tarefas & Mentoria de Leitura Compartilhada',
    objectives: 'Garantir a consolidação dos conteúdos escolares da grade regular com apoio pedagógico e autonomia.',
    development: '1. Organização dos materiais e verificação individual das agendas e tarefas escolares.\n2. Esclarecimento de dúvidas em pequenos grupos de estudo.\n3. Leitura silenciosa e compartilhada após a conclusão dos deveres.',
    materials: 'Cadernos, livros didáticos, estojos e dicionários ilustrados.',
  };
}
