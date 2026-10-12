/**
 * Serviço de IA Pedagógica e Geração de Roteiros do Semanário — Escola Crescer
 * Estruturado nos 4 Pilares Didáticos:
 * - Pilar 1 (Intencionalidade & BNCC): Objetivo formativo, foco de desenvolvimento (motor/cognitivo/social) e materiais simples.
 * - Pilar 2 (Disparador Lúdico): Introdução envolvente (música, história, pergunta disparadora).
 * - Pilar 3 (Desenvolvimento Mão na Massa): Passo a passo da mediação prática do monitor.
 * - Pilar 4 (Sintetização & Transição): Finalização, organização do espaço e transição para a próxima rotina.
 * Com adaptação dinâmica de tempo e complexidade por segmento:
 * - Mini / Maternal (15-20 min)
 * - Infantil 1 / 2 (25-35 min)
 * - Fundamental I (40-50 min)
 * - 6º Ano (45-60 min - regra anti-infantilização)
 */

import { UserProfile } from '../types';
import { getStoredUser } from '../utils/authUtils';
import { loadLocalQuadroAtribuicoes, resolveAtribuicaoForTurma } from '../utils/atribuicoesStorage';

export type SemanarioSegmento =
  | 'mini_maternal'
  | 'infantil'
  | 'fundamental_1'
  | 'fundamental_2';

export interface SegmentoConfig {
  segmento: SemanarioSegmento;
  nomeSegmento: string;
  tempoEstimadoMinutos: number;
  tempoEstimadoLabel: string;
  faixaEtaria: string;
  diretrizLinguagem: string;
  focoPedagogico: string;
}

export interface Pilar1Intencionalidade {
  objetivo: string;
  focoDesenvolvimento: 'motor' | 'cognitivo' | 'social' | 'socioemocional';
  materiais: string[];
  tempoEstimadoMinutos: number;
}

export interface Pilar2DisparadorLudico {
  tipo: 'musica' | 'historia' | 'pergunta' | 'desafio';
  descricao: string;
}

export interface Pilar3MaoNaMassa {
  passoAPasso: string[];
  mediacaoMonitor: string;
}

export interface Pilar4SintetizacaoTransicao {
  fechamento: string;
  organizacaoEspaco: string;
  transicao: string;
}

export interface Semanario4Pilares {
  pilar1_intencionalidade: Pilar1Intencionalidade;
  pilar2_disparadorLudico: Pilar2DisparadorLudico;
  pilar3_maoNaMassa: Pilar3MaoNaMassa;
  pilar4_sintetizacaoTransicao: Pilar4SintetizacaoTransicao;
  segmento: SemanarioSegmento;
  tempoEstimadoMinutos: number;
}

export interface StaffListPayload {
  adis: string[];
  monitors: string[];
  turmaAtribuicao?: {
    adi?: string;
    monitora?: string;
    assistente?: string;
  };
}

export interface GeminiProposalResult {
  title: string;
  theme?: string;
  category?: string;
  suggestedAdi?: string;
  suggestedMonitor?: string;
  livro?: string;
  versiculo?: string;
  proposta?: string;
  dinamica?: string;
  atividades?: string;
  objectives: string;
  development: string;
  materials: string;
  formattedDevelopment?: string;
  dicaMonitora?: string;
  pilares?: Semanario4Pilares;
}

/**
 * Identifica o segmento escolar da turma para adaptação de tempo e maturidade
 */
export function detectSegmentoFromTurma(turma: string): SemanarioSegmento {
  const t = (turma || '').toLowerCase();
  if (/6[º°o]|sexto\s*ano/i.test(t)) {
    return 'fundamental_2';
  }
  if (/mini|maternal|berç[aá]rio|beb[eê]|1\s*ano\s*infantil/i.test(t)) {
    return 'mini_maternal';
  }
  if (/infantil\s*(1|i|2|ii)|pr[eé]/i.test(t)) {
    return 'infantil';
  }
  if (/1[º°o]|2[º°o]|3[º°o]|4[º°o]|5[º°o]|fundamental/i.test(t)) {
    return 'fundamental_1';
  }
  return 'fundamental_1';
}

/**
 * Retorna configurações pedagógicas e tempo estimado por segmento
 */
export function getSegmentoConfig(segmento: SemanarioSegmento): SegmentoConfig {
  switch (segmento) {
    case 'mini_maternal':
      return {
        segmento,
        nomeSegmento: 'Mini e Maternal (1 a 3 anos)',
        tempoEstimadoMinutos: 20,
        tempoEstimadoLabel: '15 a 20 minutos',
        faixaEtaria: '1 a 3 anos',
        diretrizLinguagem:
          'Linguagem acolhedora, sensorial e afetiva. Respeito ao tempo breve de atenção. Uso de músicas curtas, repetições rítmicas e aconchego no colo.',
        focoPedagogico: 'Desenvolvimento sensorial, motricidade ampla, vínculos afetivos e acolhimento.',
      };
    case 'infantil':
      return {
        segmento,
        nomeSegmento: 'Educação Infantil 1 e 2 (4 e 5 anos)',
        tempoEstimadoMinutos: 30,
        tempoEstimadoLabel: '25 a 35 minutos',
        faixaEtaria: '4 e 5 anos',
        diretrizLinguagem:
          'Linguagem lúdica e imaginativa. Uso de faz de conta, personagens, perguntas curiosas e estímulo à cooperação entre os colegas.',
        focoPedagogico:
          'Imaginação simbólica, motricidade fina, coordenação motora e convivência fraterna.',
      };
    case 'fundamental_2':
      return {
        segmento,
        nomeSegmento: '6º Ano (Fundamental II / Anos Finais)',
        tempoEstimadoMinutos: 50,
        tempoEstimadoLabel: '45 a 60 minutos',
        faixaEtaria: '11 e 12 anos',
        diretrizLinguagem:
          'REGRA ANTI-INFANTILIZAÇÃO ESTRITA: Tom maduro, instigante e protagonista. Desafios investigativos, projetos reais, técnicas estruturadas, liderança e debates colaborativos.',
        focoPedagogico:
          'Raciocínio crítico, autoria, resolução de problemas, cooperação em equipe e protagonismo juvenil.',
      };
    case 'fundamental_1':
    default:
      return {
        segmento: 'fundamental_1',
        nomeSegmento: 'Ensino Fundamental I (1º ao 5º Ano)',
        tempoEstimadoMinutos: 45,
        tempoEstimadoLabel: '40 a 50 minutos',
        faixaEtaria: '6 a 10 anos',
        diretrizLinguagem:
          'Linguagem dinâmica e estimulante. Desafios investigativos, jogos com regras, colaboração prática e autonomia na organização dos materiais.',
        focoPedagogico:
          'Habilidades cognitivas, motricidade coordenada, trabalho em equipe e expressão autônoma.',
      };
  }
}

/**
 * Converte a estrutura dos 4 Pilares Didáticos em texto formatado para a descrição (formattedDevelopment)
 */
export function format4PilaresDevelopment(
  category: string,
  title: string,
  pilares: Semanario4Pilares,
  extra?: { livro?: string; versiculo?: string; dicaMonitora?: string }
): string {
  const segConfig = getSegmentoConfig(pilares.segmento);
  const cleanCat = (category || 'Atividade').trim();
  const cleanTitle = (title || 'Vivência pedagógica').trim();

  const matList = pilares.pilar1_intencionalidade.materiais.length > 0
    ? pilares.pilar1_intencionalidade.materiais.map((m) => `• ${m.replace(/^[-*•]\s*/, '').trim()}`).join('\n')
    : '• Materiais simples disponíveis na sala';

  const passosList = pilares.pilar3_maoNaMassa.passoAPasso.length > 0
    ? pilares.pilar3_maoNaMassa.passoAPasso
        .map((p, idx) => `${idx + 1}. ${p.trim()}`)
        .join('\n')
    : pilares.pilar3_maoNaMassa.mediacaoMonitor;

  const blocks: string[] = [
    `${cleanCat}:`,
    cleanTitle,
    '',
    `Pilar 1 (Intencionalidade & BNCC):`,
    `• Objetivo: ${pilares.pilar1_intencionalidade.objetivo.trim()}`,
    `• Foco de Desenvolvimento: ${pilares.pilar1_intencionalidade.focoDesenvolvimento.toUpperCase()}`,
    `• Materiais: \n${matList}`,
    `• Tempo Estimado: ${segConfig.tempoEstimadoLabel} (${segConfig.nomeSegmento})`,
    '',
    `Pilar 2 (Disparador Lúdico):`,
    pilares.pilar2_disparadorLudico.descricao.trim(),
    '',
    `Pilar 3 (Desenvolvimento Mão na Massa):`,
    passosList,
    '',
    `Pilar 4 (Sintetização & Transição):`,
    `• Fechamento: ${pilares.pilar4_sintetizacaoTransicao.fechamento.trim()}`,
    `• Organização do Espaço: ${pilares.pilar4_sintetizacaoTransicao.organizacaoEspaco.trim()}`,
    `• Transição: ${pilares.pilar4_sintetizacaoTransicao.transicao.trim()}`,
  ];

  if (extra?.livro) {
    blocks.push('', 'Livro:', extra.livro.trim());
  }

  if (extra?.versiculo) {
    blocks.push('', 'Versículo:', extra.versiculo.trim());
  }

  if (extra?.dicaMonitora) {
    blocks.push('', 'Importante:', extra.dicaMonitora.trim());
  }

  return blocks.filter((b) => b !== undefined && b !== null).join('\n');
}

/**
 * Constrói fallback pedagógico estruturado nos 4 Pilares com adaptação por segmento
 */
export function buildFallback4PilaresProposal(
  turma: string,
  category: string,
  theme?: string
): GeminiProposalResult {
  const segmento = detectSegmentoFromTurma(turma);
  const segConfig = getSegmentoConfig(segmento);
  const catLower = (category || '').toLowerCase();
  const cleanTheme = (theme || '').trim();

  let title = 'Vivência lúdica integrada';
  let pilar1: Pilar1Intencionalidade;
  let pilar2: Pilar2DisparadorLudico;
  let pilar3: Pilar3MaoNaMassa;
  let pilar4: Pilar4SintetizacaoTransicao;
  let livro: string | undefined;
  let versiculo: string | undefined;
  let dicaMonitora: string = 'manter a atenção afetuosa e incentivar a autonomia de cada criança durante a vivência.';

  if (catLower.includes('devocional')) {
    title = 'O coração que acolhe e agradece';
    versiculo = '1 Tessalonicenses 5:18 - Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.';
    pilar1 = {
      objetivo: 'proporcionar um momento sereno de reflexão sobre a gratidão, o amor de Deus e a convivência fraterna no cotidiano escolar.',
      focoDesenvolvimento: 'socioemocional',
      materiais: ['Pedrinhas decorativas da gratidão', 'Bíblia infantil com linguagem acessível', 'Almofadas para a roda'],
      tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
    };
    pilar2 = {
      tipo: segmento === 'mini_maternal' ? 'musica' : 'pergunta',
      descricao:
        segmento === 'mini_maternal'
          ? 'cantar suavemente uma canção curta de gratidão com palminhas suaves para reunir os pequenos em roda acolhedora.'
          : 'apresentar a "caixa dos agradecimentos" e fazer a pergunta disparadora: "qual foi a coisa boa que alegrou o seu coração hoje?".',
    };
    pilar3 = {
      passoAPasso: [
        'Acomodar os alunos em roda no tapete e acolher cada um pelo nome com um sorriso caloroso.',
        'Passar a pedrinha da gratidão de mão em mão, permitindo que cada um compartilhe um motivo de alegria ou gratidão.',
        'Ler o versículo em tom sereno e realizar uma oração participativa e simples agradecendo pela amizade e pela escola.',
      ],
      mediacaoMonitor:
        'A monitora conduz a roda com voz suave e incentiva a escuta respeitosa dos colegas.',
    };
    pilar4 = {
      fechamento: 'abraço coletivo ou gesto de carinho entre os colegas de roda.',
      organizacaoEspaco: 'guardar as pedrinhas na caixa especial e organizar as almofadas com a ajuda dos alunos.',
      transicao: 'cantar uma melodia serena anunciando a transição tranquila para a próxima atividade da rotina.',
    };
    dicaMonitora = 'acolha com carinho os sentimentos trazidos pelas crianças, respeitando o silêncio de quem preferir apenas observar.';
  } else if (catLower.includes('história') || catLower.includes('historia') || catLower.includes('literatura')) {
    title = 'A viagem mágica das emoções coloridas';
    livro = 'O Monstro das Cores, de Anna Llenas (Editora Aletria).';
    pilar1 = {
      objetivo: 'estimular a imaginação, a escuta atenta e o reconhecimento das emoções básicas por meio da apreciação de narrativa literária.',
      focoDesenvolvimento: 'cognitivo',
      materiais: ['Livro impresso O Monstro das Cores', 'Potes transparentes', 'Novelos de lã ou fitas coloridas'],
      tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
    };
    pilar2 = {
      tipo: 'historia',
      descricao:
        segmento === 'mini_maternal'
          ? 'apresentar fantoches de feltro coloridos que fazem sons suaves e convidam para o momento da historinha.'
          : 'mostrar a capa do livro misteriosamente e perguntar: "o que vocês acham que acontece quando as cores dos sentimentos se misturam?".',
    };
    pilar3 = {
      passoAPasso: [
        'Reunir as crianças no espaço da leitura e apresentar a capa e os personagens com entusiasmo.',
        'Fazer a leitura mediada com pausas dramáticas, explorando expressões faciais para cada sentimento (calma, alegria, tristeza, raiva).',
        'Convidar os alunos a separar fios coloridos nos potinhos transparentes conforme os sentimentos abordados na história.',
      ],
      mediacaoMonitor:
        'A monitora modula o tom de voz e aproxima o livro para que todos apreciem as ilustrações com riqueza.',
    };
    pilar4 = {
      fechamento: 'conversa rápida onde cada criança expressa qual cor representa seu sentimento naquele momento.',
      organizacaoEspaco: 'guardar os potinhos e os novelos de lã na sacola de contação de histórias.',
      transicao: 'caminhar em fila silenciosa imitando passos leves de monstrinhos calmos até o próximo ambiente.',
    };
    dicaMonitora = 'mantenha a contação dentro do tempo adequado ao segmento para evitar dispersão e acolha no colo quem solicitar aconchego.';
  } else if (catLower.includes('artes') || catLower.includes('pintura') || catLower.includes('desenho')) {
    if (segmento === 'fundamental_2') {
      title = 'Estudos de textura e composições geométricas';
      pilar1 = {
        objetivo: 'desenvolver percepção espacial, composição abstrata e técnicas de luz e textura com suporte estruturado, sem infantilização.',
        focoDesenvolvimento: 'cognitivo',
        materiais: ['Papel cartão preto ou kraft grosso', 'Lápis grafite 4B/6B e carvão vegetal', 'Fitas adesivas crepe e réguas de metal'],
        tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
      };
      pilar2 = {
        tipo: 'desafio',
        descricao:
          'apresentar referências de xilogravuras e mandalas contemporâneas e desafiar a turma a criar um estudo de contraste e perspectiva.',
      };
      pilar3 = {
        passoAPasso: [
          'Delimitar o grid geométrico com fita crepe sobre o papel cartão.',
          'Aplicar diferentes graduações de grafite e texturas em hachuras em cada quadrante do suporte.',
          'Remover a fita com cuidado revelando o contraste límpido das linhas brancas com as áreas sombreadas.',
        ],
        mediacaoMonitor:
          'Orientar individualmente sobre a inclinação do grafite e valorizar a autoria estética dos alunos.',
      };
      pilar4 = {
        fechamento: 'mini-exposição comentada na bancada onde cada estudante aponta uma técnica interessante do colega.',
        organizacaoEspaco: 'higienização das mãos, guarda cuidadosa dos materiais de desenho e limpeza das bancadas pelos próprios alunos.',
        transicao: 'condução autônoma e organizada para o horário de intervalo/estudo.',
      };
    } else {
      title = 'Ateliê sensorial das cores e formas';
      pilar1 = {
        objetivo: 'explorar a sensibilidade artística, a percepção de cores e formas e a coordenação motora fina em vivência plástica acolhedora.',
        focoDesenvolvimento: 'motor',
        materiais: ['Papel kraft em bobina', 'Tintas guache atóxicas em tons variados', 'Pincéis chatos e esponjas naturais', 'Aventais protetores'],
        tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
      };
      pilar2 = {
        tipo: 'pergunta',
        descricao: 'mostrar uma folha em branco com gotas de cores primárias e perguntar: "o que acontece se a gente dançar com as cores no papel?".',
      };
      pilar3 = {
        passoAPasso: [
          'Vestir os aventais e organizar as crianças ao redor do painel coletivo de papel kraft.',
          'Disponibilizar os pincéis e esponjas, incentivando a exploração de texturas, carimbos manuais e misturas livres.',
          'Acompanhar a criação respeitando o traço e o ritmo de cada pequeno artista.',
        ],
        mediacaoMonitor:
          'Incentivar a autonomia expressiva sem impor modelos prontos, garantindo a celebração de cada produção.',
      };
      pilar4 = {
        fechamento: 'apreciação do painel coletivo com palmas e identificação dos detalhes criados por cada um.',
        organizacaoEspaco: 'lavagem dos pincéis e esponjas, retirada dos aventais e descarte correto dos resíduos.',
        transicao: 'lavagem caprichosa das mãos na pia em fila cantada e deslocamento calmo para o lanche.',
      };
    }
  } else {
    // Categoria geral / esportes / recreação
    title = cleanTheme ? `Vivência prática sobre ${cleanTheme}` : 'Circuito cooperativo de descobertas';
    pilar1 = {
      objetivo: 'desenvolver cooperação, prontidão motora e autonomia corporal por meio de desafios participativos em grupo.',
      focoDesenvolvimento: 'social',
      materiais: ['Cones baixos e arcos de plástico', 'Bolas macias de borracha', 'Fita demarcatória de solo'],
      tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
    };
    pilar2 = {
      tipo: 'desafio',
      descricao: 'reunir a turma e lançar um desafio cooperativo onde a meta só é alcançada quando todos os colegas participarem juntos.',
    };
    pilar3 = {
      passoAPasso: [
        'Explicar as regras do circuito de forma clara e visual, demonstrando os movimentos com auxílio de uma criança voluntária.',
        'Dividir a turma em pequenos grupos integrados para que todos participem ativamente sem longas filas de espera.',
        'Mediar o andamento do jogo incentivando o apoio mútuo, o respeito às regras e o incentivo ao colega.',
      ],
      mediacaoMonitor:
        'Acompanhar a dinâmica com visão periférica de 360°, estimulando o espírito cooperativo.',
    };
    pilar4 = {
      fechamento: 'roda de conversa breve para respirar, alongar e destacar momentos bonitos de colaboração.',
      organizacaoEspaco: 'recolhimento conjunto dos materiais nos cestos organizadores da quadra/sala.',
      transicao: 'caminhada tranquila com hidratação nos bebedouros antes de seguir para a próxima rotina.',
    };
  }

  const pilares: Semanario4Pilares = {
    pilar1_intencionalidade: pilar1,
    pilar2_disparadorLudico: pilar2,
    pilar3_maoNaMassa: pilar3,
    pilar4_sintetizacaoTransicao: pilar4,
    segmento,
    tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
  };

  const formattedDevelopment = format4PilaresDevelopment(category, title, pilares, {
    livro,
    versiculo,
    dicaMonitora,
  });

  const materialsText = pilar1.materiais.map((m) => `• ${m}`).join('\n');
  const objectivesText = `${pilar1.objetivo} [Foco: ${pilar1.focoDesenvolvimento.toUpperCase()}]`;

  return {
    title,
    theme: cleanTheme || 'Vivência pedagógica integrada',
    category,
    objectives: objectivesText,
    development: formattedDevelopment,
    formattedDevelopment,
    materials: materialsText,
    proposta: pilar1.objetivo,
    atividades: pilar3.passoAPasso.join(' '),
    dinamica: `${pilar2.descricao} ${pilar3.mediacaoMonitor}`,
    dicaMonitora,
    livro,
    versiculo,
    pilares,
  };
}

/**
 * Função principal para solicitar ao servidor ou gerar proposta do Semanário
 * estruturada nos 4 Pilares Didáticos
 */
export async function generateSemanarioProposal(
  turma: string,
  category: string,
  dayOfWeek: string,
  date: string,
  theme?: string,
  signal?: AbortSignal,
  currentUser?: UserProfile | null,
  staffList?: StaffListPayload
): Promise<{ success: boolean; proposal?: GeminiProposalResult; error?: string }> {
  try {
    const userToVerify = currentUser !== undefined ? currentUser : getStoredUser();
    const userRole = userToVerify?.role || '';
    const userEmail = userToVerify?.email || '';

    // Fonte prioritária: Atribuições da turma
    let finalStaffList: StaffListPayload = staffList || { adis: [], monitors: [] };
    if (!finalStaffList.turmaAtribuicao || (!finalStaffList.adis.length && !finalStaffList.monitors.length)) {
      try {
        const atribuicoes = loadLocalQuadroAtribuicoes();
        const turmaAtribuicao = resolveAtribuicaoForTurma(turma, atribuicoes);
        const turmaAdis = [turmaAtribuicao.adiName].filter(Boolean) as string[];
        const turmaMonitors = [
          turmaAtribuicao.monitoraName,
          turmaAtribuicao.monitoraAssistenteName,
        ].filter(Boolean) as string[];

        finalStaffList = {
          adis: turmaAdis.length > 0 ? turmaAdis : finalStaffList.adis,
          monitors: turmaMonitors.length > 0 ? turmaMonitors : finalStaffList.monitors,
          turmaAtribuicao: {
            adi: turmaAtribuicao.adiName || undefined,
            monitora: turmaAtribuicao.monitoraName || undefined,
            assistente: turmaAtribuicao.monitoraAssistenteName || undefined,
          },
        };
      } catch {}
    }

    const res = await fetch('/api/gemini/generate-proposal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole,
        'x-user-email': userEmail,
      },
      body: JSON.stringify({
        turma,
        category,
        dayOfWeek,
        date,
        theme: theme && theme.trim() ? theme.trim() : undefined,
        userRole,
        userEmail,
        staffList: finalStaffList,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.proposal && data.proposal.title) {
        return {
          success: true,
          proposal: data.proposal,
        };
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    console.warn('[semanarioAiService] Falha na chamada da IA, acionando gerador curado dos 4 Pilares:', err);
  }

  // Fallback curado oficial dos 4 Pilares Didáticos
  const fallback = buildFallback4PilaresProposal(turma, category, theme);
  return {
    success: true,
    proposal: fallback,
  };
}

// Retrocompatibilidade de nomenclatura
export const fetchGeminiProposal = generateSemanarioProposal;
