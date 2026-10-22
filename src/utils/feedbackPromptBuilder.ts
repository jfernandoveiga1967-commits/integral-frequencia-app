/**
 * Utilitário de Geração de Prompts e Mensagens de Feedback Pedagógico Cordial
 * Motor Universal e 100% Dinâmico com foco estrito na norma institucional selecionada,
 * fundamentado nos princípios da Comunicação Não-Violenta (CNV), flexão de gênero
 * e formatação nativa para WhatsApp (*).
 */

import { getSalutationForName } from './genderUtils';

export type FeedbackNormTheme =
  | 'fardamento'
  | 'transporte_portao'
  | 'celular_radio'
  | 'alimentacao'
  | 'parque_seguranca'
  | 'postura_pontualidade'
  | 'sensivel_acolhimento'
  | 'licao_estudo'
  | 'geral';

export interface DynamicFeedbackParams {
  userName: string;
  normTitle: string;
  rawContext: string;
  normSection?: string;
  normDetails?: string[];
  selectedChecklistItem?: string;
}

export interface DynamicFeedbackResult {
  message: string;
  actionPoints: string[];
}

/**
 * Detecta a categoria temática central da norma selecionada para contextualização dinâmica e vocabulário estrito
 */
export function detectNormTheme(
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[]
): FeedbackNormTheme {
  const titleLower = (normTitle || '').toLowerCase();
  const contextLower = (rawContext || '').toLowerCase();
  const combined = [
    titleLower,
    contextLower,
    normSection || '',
    Array.isArray(normDetails) ? normDetails.join(' ') : '',
  ]
    .join(' ')
    .toLowerCase();

  // 1. Verificação prioritária pelo título da norma selecionada
  if (/uniforme|fardamento|vestimenta|vestuário|crachá|apresentação pessoal/i.test(titleLower)) {
    return 'fardamento';
  }
  if (/pontualidade|carga horária|horário|horários|assiduidade|postura|conduta|ética|atraso/i.test(titleLower)) {
    return 'postura_pontualidade';
  }
  if (/celular|telefone|rádio|comunicador|eletrônico/i.test(titleLower)) {
    return 'celular_radio';
  }
  if (/alimentação|almoço|jantar|lanche|refeição|refeitório|nutri/i.test(titleLower)) {
    return 'alimentacao';
  }
  if (/deslocamento|transporte|van|ônibus|trajeto|embarque|catraca|transição|portão/i.test(titleLower)) {
    return 'transporte_portao';
  }
  if (/parque|brinquedo|área externa|pátio|quadra/i.test(titleLower)) {
    return 'parque_seguranca';
  }
  if (/socioemocional|acolhimento|conflito|choro|mordida|sensível/i.test(titleLower)) {
    return 'sensivel_acolhimento';
  }
  if (/lição|estudo|tarefa|dever/i.test(titleLower)) {
    return 'licao_estudo';
  }

  // 2. Verificação secundária pelo texto combinado (sem termos ambíguos como "saída" isolada)
  if (
    /uniforme|fardamento|vestimenta|vestuário|roupa|crachá|camisa|avental|calçado|tênis|chinelo|identificação funcional|apresentação pessoal/i.test(
      combined
    )
  ) {
    return 'fardamento';
  }
  if (
    /pontualidade|carga horária|horário de entrada|atraso|atrasos|assiduidade|postura|comportamento|linguagem|ética|compromisso|revezamento|registro de ponto/i.test(
      combined
    )
  ) {
    return 'postura_pontualidade';
  }
  if (
    /celular|telefone|zap|whatsapp|rádio|comunicador|fone|rede social|foto|filmagem|gravação|distração|dispersão/i.test(
      combined
    )
  ) {
    return 'celular_radio';
  }
  if (
    /almoço|jantar|lanche|refeição|refeitório|comida|prato|talher|engasgo|mastigação|alérgeno|nutri|dieta/i.test(
      combined
    )
  ) {
    return 'alimentacao';
  }
  if (
    /van|ônibus|transporte|rampa|portão|portaria|calçada|embarque|desembarque|catraca|academia|deslocamento|deslocamentos|transição|transicoes|trajeto|trajetos|fila/i.test(
      combined
    )
  ) {
    return 'transporte_portao';
  }
  if (
    /parque|parcão|brinquedo|escorregador|balanço|queda|quedas|pátio|área externa|quadra|desnível/i.test(
      combined
    )
  ) {
    return 'parque_seguranca';
  }
  if (
    /choro|mordida|birra|grito|conflito|briga|acolhimento|sono|fralda|machucou|desfralde|abraço|emoção|mediação/i.test(
      combined
    )
  ) {
    return 'sensivel_acolhimento';
  }
  if (/lição|dever|tarefa|caderno|estudo|reforço|sala de estudos/i.test(combined)) {
    return 'licao_estudo';
  }

  return 'geral';
}

/**
 * Constrói a mensagem pedagógica universal fundamentada nos princípios da CNV:
 * - Saudação afetuosa (*Querida [Nome]!* / *Querido [Nome]!*)
 * - Agradecimento pelo empenho e dedicação no Programa do Integral
 * - Retomada cordial da situação observada referente estritamente à norma específica
 * - A razão pedagógica/institucional e de segurança daquele procedimento (100% dinâmico)
 * - Destaque formatado da norma: *“[Título da Norma]” (Seção [Número])* com a orientação preventiva
 * - Reconhecimento da responsabilidade coletiva e compromisso preventivo
 * - Encerramento afetuoso e assinatura institucional padrão
 */
export function buildDynamicPedagogicalFeedback({
  userName,
  normTitle,
  rawContext,
  normSection,
  normDetails,
  selectedChecklistItem,
}: DynamicFeedbackParams): DynamicFeedbackResult {
  const { salutation, firstName } = getSalutationForName(userName);
  const cleanSection = normSection ? String(normSection).replace(/[^0-9]/g, '') || String(normSection) : '';
  const sectionLabel = cleanSection ? ` (Seção ${cleanSection})` : '';
  const cleanNormTitle = (normTitle || '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const normFullRef = `*“${cleanNormTitle}”${sectionLabel}*`;
  const cleanContext = (rawContext || '').trim();
  const cleanItem = (selectedChecklistItem || '').trim().replace(/^[-•*]\s*/, '');

  const theme = detectNormTheme(cleanNormTitle, cleanItem || cleanContext, normSection, normDetails);

  let situacaoResumo = '';
  let razaoProcedimento = '';
  let acaoOrientativa = '';
  let actionPoints: string[] = [];

  switch (theme) {
    case 'fardamento':
      situacaoResumo = cleanContext || 'a utilização correta do vestuário institucional e do crachá de identificação funcional durante as atividades da rotina';
      razaoProcedimento = 'seguirmos rigorosamente o padrão de vestuário institucional e o uso do crachá, assegurando a imediata identificação da equipe, a salvaguarda de toda a comunidade escolar e a segurança das crianças';
      acaoOrientativa = 'o uso diário obrigatório do uniforme completo, limpo e alinhado, acompanhado do crachá funcional visível em todos os momentos de atendimento aos alunos';
      actionPoints = [
        'Utilizar o uniforme completo e o crachá funcional em todos os momentos de atendimento aos alunos.',
        'Reconhecer o fardamento institucional como medida indispensável de segurança, identificação e salvaguarda escolar.',
        'Comunicar a coordenação preventivamente caso haja necessidade de reposição ou ajuste em qualquer peça.',
      ];
      break;

    case 'transporte_portao':
      situacaoResumo = cleanContext || 'a condução atenta dos alunos, a contagem nominal contínua e a organização durante os deslocamentos e transições de espaços';
      razaoProcedimento = 'seguirmos rigorosamente os procedimentos de contagem nominal, formação de fila organizada e vigilância atenta em todos os deslocamentos e trajetos';
      acaoOrientativa = 'a conferência nominal contínua das crianças, a condução em fila organizada e a supervisão ativa de todos os pontos cegos e passagens';
      actionPoints = [
        'Conferir nominalmente todas as crianças antes do início e ao término de cada deslocamento ou transição.',
        'Conduzir os alunos em fila segura e organizada pelas rampas, escadas, calçadas e portões.',
        'Manter vigilância visual constante de 360°, garantindo que nenhuma criança fique desacompanhada.',
      ];
      break;

    case 'postura_pontualidade':
      situacaoResumo = cleanContext || 'o cumprimento pontual dos horários contratuais de entrada, intervalos e a manutenção de uma postura profissional exemplar';
      razaoProcedimento = 'zelarmos pela pontualidade britânica, assiduidade e conduta ética profissional, fortalecendo a harmonia da rotina e a confiança da comunidade escolar';
      acaoOrientativa = 'a pontualidade nos horários contratuais, o registro tempestivo do ponto e a manutenção de uma postura afetuosa, ética e profissional';
      actionPoints = [
        'Cumprir rigorosamente os horários contratuais de início de turno, intervalos de almoço e saída programada.',
        'Registrar os horários de ponto com fidelidade e transparência nos sistemas do colégio.',
        'Cultivar postura acolhedora, linguagem respeitosa e ética profissional em todas as interações com alunos e famílias.',
      ];
      break;

    case 'celular_radio':
      situacaoResumo = cleanContext || 'a atenção visual ininterrupta com as crianças e o uso dos canais oficiais de comunicação interna do colégio';
      razaoProcedimento = 'mantermos o foco visual de 360° permanentemente voltado aos alunos, sem dispersões com aparelhos particulares e com escuta atenta no rádio comunicador';
      acaoOrientativa = 'a guarda dos celulares particulares durante o atendimento às crianças e a prontidão constante no canal oficial do rádio comunicador institucional';
      actionPoints = [
        'Manter a atenção 100% voltada aos alunos durante todo o turno de monitoria, sem dispersões com telas pessoais.',
        'Guardar o aparelho celular pessoal em local adequado, utilizando-o apenas nos intervalos regulamentares.',
        'Manter o rádio comunicador ligado no canal oficial e em volume adequado para pronto suporte com a coordenação.',
      ];
      break;

    case 'alimentacao':
      situacaoResumo = cleanContext || 'o acompanhamento próximo, a supervisão ativa e o acolhimento afetuoso durante as refeições e lanches dos alunos';
      razaoProcedimento = 'seguirmos com rigor os protocolos de supervisão durante as refeições, prevenindo riscos de engasgo e respeitando todas as restrições alimentares';
      acaoOrientativa = 'a vigilância ativa na mastigação, o respeito absoluto a restrições e alergias e o estímulo afetuoso aos bons hábitos à mesa';
      actionPoints = [
        'Acompanhar de perto a mastigação e postura das crianças durante as refeições, prevenindo riscos de engasgo.',
        'Verificar rigorosamente os registros de restrições alimentares e alergias antes da oferta de qualquer alimento.',
        'Estimular a autonomia dos alunos com orientação afetuosa e organização dos talheres e bandejas.',
      ];
      break;

    case 'parque_seguranca':
      situacaoResumo = cleanContext || 'o acompanhamento preventivo e o posicionamento estratégico durante as brincadeiras e atividades no parque e áreas externas';
      razaoProcedimento = 'mantermos o posicionamento estratégico com visão panorâmica de todos os brinquedos, prevenindo quedas e colisões nas brincadeiras';
      acaoOrientativa = 'a intervenção preventiva e afetuosa diante de riscos, a supervisão atenta em brinquedos elevados e a vistoria prévia dos espaços';
      actionPoints = [
        'Posicionar-se estrategicamente no parque com visão panorâmica de todos os brinquedos e pontos de maior altura.',
        'Intervir de forma preventiva e afetuosa diante de comportamentos que ofereçam risco de queda ou colisão.',
        'Inspecionar previamente os brinquedos e comunicar qualquer necessidade de reparo ou manutenção.',
      ];
      break;

    case 'sensivel_acolhimento':
      situacaoResumo = cleanContext || 'a mediação afetuosa, a escuta paciente e a abordagem compreensiva em situações sensíveis e de regulação emocional dos alunos';
      razaoProcedimento = 'adotarmos uma abordagem acolhedora na altura dos olhos da criança, mediando conflitos com empatia e sem repreensões punitivas';
      acaoOrientativa = 'o acolhimento afetuoso dos sentimentos infantis, o diálogo sereno para resolução pacífica de conflitos e o suporte socioemocional empático';
      actionPoints = [
        'Acolher os momentos de choro ou frustração na altura dos olhos da criança, com tom sereno e escuta paciente.',
        'Mediar conflitos entre alunos incentivando a empatia, o diálogo fraterno e o respeito mútuo.',
        'Reportar ocorrências socioemocionais relevantes à coordenação para acompanhamento junto às famílias.',
      ];
      break;

    case 'licao_estudo':
      situacaoResumo = cleanContext || 'a mediação pedagógica paciente e o estímulo à autonomia durante os momentos dedicados ao estudo e lição de casa';
      razaoProcedimento = 'oferecermos um ambiente calmo, organizado e incentivador para o desenvolvimento da autonomia nos estudos e cumprimento das tarefas';
      acaoOrientativa = 'a mediação paciente estimulando a reflexão da criança na resolução das tarefas, zelando pelo capricho e organização dos materiais';
      actionPoints = [
        'Organizar o ambiente de estudo garantindo tranquilidade, iluminação e recursos necessários.',
        'Auxiliar os alunos a tirarem dúvidas estimulando a reflexão autônoma e o capricho com os cadernos.',
        'Registrar no controle pedagógico a conclusão das tarefas e eventuais dificuldades pontuais.',
      ];
      break;

    default:
      situacaoResumo = cleanContext || `a observância atenta e o alinhamento diário aos procedimentos institucionais previstos em "${cleanNormTitle}"`;
      razaoProcedimento = `seguirmos rigorosamente as diretrizes e procedimentos homologados para ${cleanNormTitle}, resguardando a organização e a segurança integral dos alunos`;
      acaoOrientativa = 'a aplicação consistente e preventiva dos procedimentos institucionais em todas as ações da rotina escolar';
      actionPoints = [
        `Revisar e praticar a orientação prevista na norma "${cleanNormTitle}"${sectionLabel}.`,
        'Manter a prioridade absoluta na segurança física e proteção socioemocional dos alunos.',
        'Acionar a coordenação proativamente diante de qualquer dúvida ou situação atípica na rotina.',
      ];
      break;
  }

  // Se houver um item específico do checklist selecionado, o foco é 100% nele
  if (cleanItem) {
    situacaoResumo = `o ponto específico observado referente a "${cleanItem}"`;
    razaoProcedimento = `a atenção rigorosa e o cuidado preventivo quanto a "${cleanItem}", resguardando a integridade das crianças e o alinhamento institucional`;
    acaoOrientativa = `a observância pontual e permanente quanto a "${cleanItem}" em todos os momentos de atendimento aos alunos`;
    actionPoints = [
      `Cumprir integralmente o procedimento: "${cleanItem}"`,
      `Alinhamento e compromisso com a norma "${cleanNormTitle}"${sectionLabel}`,
      'Zelo contínuo pela segurança, organização e bem-estar das crianças',
    ];
  } else if (Array.isArray(normDetails) && normDetails.length > 0) {
    // Incorpora detalhes específicos do manual no checklist se existirem
    const customPoint = normDetails[0].trim();
    if (customPoint && !actionPoints.some((p) => p.includes(customPoint))) {
      actionPoints.splice(1, 0, `Observar a orientação específica: ${customPoint}`);
    }
  }

  const saudacao = salutation === 'querido' ? `*Querido ${firstName}!*` : `*Querida ${firstName}!*`;
  const cleanSituacaoResumo = situacaoResumo.replace(/[\.\s]+$/, '').trim();
  const cleanRazao = razaoProcedimento.replace(/[\.\s]+$/, '').trim();
  const cleanAcao = acaoOrientativa.replace(/[\.\s]+$/, '').trim();

  const message = `${saudacao}

Esperamos que você esteja bem. Gostaríamos de começar agradecendo pelo seu empenho e pela dedicação diária aos nossos alunos no Programa do Integral do Colégio Crescer.

Gostaríamos de retomar uma situação ocorrida durante a rotina: ${cleanSituacaoResumo}.

Sabemos que a rotina do Integral exige atenção constante, organização e cuidado com diferentes necessidades das crianças. Ainda assim, situações como essa reforçam a importância de ${cleanRazao}.

Por isso, retomamos a orientação prevista na norma institucional ${normFullRef}, destacando ${cleanAcao}.

Mais do que uma etapa da rotina, a atenção a este procedimento é uma medida indispensável de segurança, alinhamento institucional e responsabilidade coletiva. A atenção a essa conduta contribui diretamente para a proteção, o acolhimento e o bem-estar das crianças sob nossos cuidados.

Contamos com seu compromisso para reforçar essa prática em todos os momentos, mantendo a atenção necessária para que situações semelhantes sejam prevenidas.

Agradecemos sua compreensão e parceria na construção de uma rotina cada vez mais segura e cuidadosa para nossos alunos.

*Atenciosamente*,
Coordenação do Integral
Colégio Crescer`;

  return {
    message: sanitizeCordialMessageForWhatsApp(message, {
      userName,
      normTitle: cleanNormTitle,
      rawContext,
      normSection: cleanSection,
    }),
    actionPoints,
  };
}

/**
 * Constrói o System Prompt refinado para o Gemini (Flash)
 * com FOCO ESTRITO E RESTRITO AO ASSUNTO DA NORMA SELECIONADA
 * e eliminação completa de frases genéricas inadequadas (deslocamento, academia, etc.)
 */
export function buildGeminiFeedbackSystemPrompt({
  userName,
  normTitle,
  rawContext,
  normSection,
  normDetails,
  selectedChecklistItem,
}: DynamicFeedbackParams): string {
  const { salutation, firstName } = getSalutationForName(userName);
  const cleanSection = normSection ? String(normSection).replace(/[^0-9]/g, '') || String(normSection) : '';
  const sectionLabel = cleanSection ? ` (Seção ${cleanSection})` : '';
  const cleanNormTitle = (normTitle || '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const cleanContext = (rawContext || '').trim();
  const cleanCheckItem = (selectedChecklistItem || '').trim().replace(/^[-•*]\s*/, '');
  const saudacao = salutation === 'querido' ? `*Querido ${firstName}!*` : `*Querida ${firstName}!*`;

  return `Você é a Coordenação do Programa do Período Integral do Colégio Crescer.
Sua missão é gerar um Feedback Pedagógico Cordial individual para o(a) colaborador(a) ${userName}, fundamentado estritamente nos princípios da Comunicação Não-Violenta (CNV), tom acolhedor, respeito mútuo e compromisso inegociável com a segurança, o bem-estar dos alunos e as diretrizes institucionais.

==================================================
DIRETRIZ DE FOCO ESTRITO E CONTEXTUALIZAÇÃO DINÂMICA (REGRA CRÍTICA):
1. O texto gerado deve ser 100% DINÂMICO e RESTRITO AO TEMA DA NORMA SELECIONADA:
   - Norma: "${cleanNormTitle}"${sectionLabel}
   - Detalhes do Manual: ${Array.isArray(normDetails) && normDetails.length > 0 ? normDetails.join('; ') : 'Manual de Normas e Conduta do Colégio Crescer'}
   ${cleanCheckItem ? `- ITEM ESPECÍFICO DO CHECKLIST OBSERVADO: "${cleanCheckItem}"` : ''}
   ${cleanContext ? `- Contexto do Fato / Resumo Adicional: "${cleanContext}"` : ''}

${cleanCheckItem ? `==================================================
DIRETRIZ DE FOCO EXCLUSIVO NO ITEM DO CHECKLIST SELECIONADO (REGRA MÁXIMA):
Se um 'item do checklist' específico for fornecido, a mensagem DEVE se concentrar 100% nessa situação pontual. NÃO adicione contextos genéricos ou outros pontos da norma que não foram o foco da observação. Mantenha a Comunicação Não Violenta (CNV), abordando o motivo pedagógico/de segurança focado estritamente nesse item selecionado.
- Item focado: "${cleanCheckItem}"
- Na retomada cordial da situação observada, cite explicitamente esse item específico ("${cleanCheckItem}").
- Na razão pedagógica/de segurança, aborde exclusivamente a justificativa protetiva e de conformidade referente a esse item específico.
- No checklist de ciência ('actionPoints'), o Item 1 DEVE ser o cumprimento prático pontual deste item ("${cleanCheckItem}").
==================================================` : `2. ELIMINE TOTALMENTE QUALQUER FRASE GENÉRICA FIXA OU DESLOCADA DO ASSUNTO:
   - NUNCA mencione "deslocamento", "trajetos", "transporte", "fila" ou "academia" se a norma NÃO for sobre deslocamento/transporte!
   - Se a norma for sobre UNIFORME / FARDAMENTO (ex: Seção 28): o texto deve tratar EXCLUSIVAMENTE de vestuário institucional completo, crachá, padronização visual, salvaguarda institucional e identificação imediata perante famílias e crianças. JAMAIS mencione trânsito ou deslocamento!
   - Se a norma for sobre DESLOCAMENTO / TRANSPORTE (ex: Seção 17): o texto deve tratar da contagem nominal contínua de alunos, embarque, desembarque, organização da fila e segurança durante os trajetos.
   - Se a norma for sobre POSTURA / PONTUALIDADE (ex: Seção 5 ou Seção 30): o texto deve tratar de assiduidade, cumprimento da carga horária, registro de ponto, conduta ética e postura exemplar para as crianças.
   - Se a norma for sobre USO DE CELULAR (ex: Seção 12): o texto deve tratar da atenção visual contínua de 360°, eliminação de dispersões visuais com aparelhos particulares e uso do rádio comunicador institucional.
   - Se a norma for sobre ALIMENTAÇÃO (ex: Seção 15): o texto deve tratar do acompanhamento de refeições, prevenção de engasgos e observância rigorosa a restrições e alergias.
   - Se a norma for sobre OUTROS TEMAS (Parque, Lição de Casa, Abordagem Socioemocional, etc.): o texto deve focar estritamente na razão pedagógica e institucional daquele assunto.`}

==================================================
MODELO OBRIGATÓRIO DE SAÍDA (ESTRUTURA UNIVERSAL CNV):

${saudacao}

Esperamos que você esteja bem. Gostaríamos de começar agradecendo pelo seu empenho e pela dedicação diária aos nossos alunos no Programa do Integral do Colégio Crescer.

Gostaríamos de retomar uma situação ocorrida durante a rotina: [Resumo cordial da situação observada referente estritamente ao item específico do checklist ou à norma].

Sabemos que a rotina do Integral exige atenção constante, organização e cuidado com diferentes necessidades das crianças. Ainda assim, situações como essa reforçam a importância de [A razão pedagógica, institucional e de segurança específica deste ponto focado, sem usar palavras genéricas de outros temas].

Por isso, retomamos a orientação prevista na norma institucional *“${cleanNormTitle}”${sectionLabel}*, destacando [Ação orientativa e preventiva específica e esperada da colaboradora focada no item do checklist ou na norma].

Mais do que uma etapa da rotina, a atenção a este procedimento é uma medida indispensável de segurança, alinhamento institucional e responsabilidade coletiva. A atenção a essa conduta contribui diretamente para a proteção, o acolhimento e o bem-estar das crianças sob nossos cuidados.

Contamos com seu compromisso para reforçar essa prática em todos os momentos, mantendo a atenção necessária para que situações semelhantes sejam prevenidas.

Agradecemos sua compreensão e parceria na construção de uma rotina cada vez mais segura e cuidadosa para nossos alunos.

*Atenciosamente*,
Coordenação do Integral
Colégio Crescer
==================================================

INSTRUÇÕES DE PREENCHIMENTO DOS CAMPOS ENTRE COLCHETES:
1. Saudação: DEVE ser exatamente "${saudacao}" em negrito com asterisco (*).
2. [Resumo cordial da situação observada...]:
   ${cleanCheckItem ? `Retome com acolhimento e cordialidade estritamente o item observado: "${cleanCheckItem}". NÃO misture com outros assuntos da norma.` : (cleanContext ? `Integre o seguinte fato com cordialidade e acolhimento: "${cleanContext}"` : `Sintetize cordialmente uma situação típica da rotina escolar referente estritamente à norma "${cleanNormTitle}"${sectionLabel}, mantendo tom afetuoso e acolhedor.`)}
3. [A razão pedagógica, institucional e de segurança...]:
   ${cleanCheckItem ? `Apresente a razão pedagógica/de segurança específica e direta do item "${cleanCheckItem}".` : `Apresente a justificativa pedagógica e institucional genuína do tema da norma "${cleanNormTitle}"${sectionLabel}. Não use frases genéricas de outros temas.`}
4. [Ação orientativa e preventiva esperada...]:
   ${cleanCheckItem ? `Explique a conduta prática esperada referente a "${cleanCheckItem}".` : `Explique com clareza e acolhimento a ação prática orientativa esperada da colaboradora.`}
5. Encerramento: Finalize ESTRITAMENTE com:
*Atenciosamente*,
Coordenação do Integral
Colégio Crescer

Gere a resposta estritamente em formato JSON com o seguinte schema:
{
  "message": "Texto completo da mensagem exatamente nos parágrafos do modelo obrigatório, mantendo os destaques em *",
  "actionPoints": [
    "Item 1 prático do checklist de ciência da colaboradora para assinar no app",
    "Item 2 prático do checklist de ciência da colaboradora para assinar no app",
    "Item 3 prático do checklist de ciência da colaboradora para assinar no app"
  ]
}`;
}

export const STANDARD_FEEDBACK_CLOSING = '*Atenciosamente*,\nCoordenação do Integral\nColégio Crescer';

/**
 * Remove rigorosamente qualquer bloco de assinatura, despedida ou rodapé pré-existente
 * ao final do texto (inclusive variações com 'Equipe do Integral', 'Coordenação', etc.),
 * garantindo que assinaturas redundantes ou duplicadas sejam completamente eliminadas.
 */
export function stripTrailingFeedbackSignatures(text: string): string {
  if (!text) return '';
  let msg = text.trim();

  // Padrão abrangente para capturar despedidas no final da mensagem (em linha única ou com quebras)
  const trailingSignatureRegex = /\n+\s*\*?(?:Atenciosamente|Um abraço(?: fraterno)?|Fraternalmente|Com carinho|Cordialmente|Abraços?)\*?,?.*$/is;

  // Padrão para capturar encerramentos de rodapé residuais (Coordenação / Equipe / Colégio Crescer)
  const trailingFooterRegex = /\n+\s*\*?(?:Coordenação (?:do Integral|Pedagógica)|Equipe (?:do Integral|Pedagógica)|Colégio Crescer)[\s\S]*$/is;

  let prev = '';
  while (msg !== prev) {
    prev = msg;
    msg = msg.replace(trailingSignatureRegex, '').trim();
    msg = msg.replace(trailingFooterRegex, '').trim();
  }

  return msg;
}

/**
 * Sanitiza e valida a mensagem cordial para WhatsApp e para o sistema:
 * - Mantém a saudação obrigatória (*Querida [Nome]!* ou *Querido [Nome]!*)
 * - Converte asteriscos duplos (**) em simples (*) para negrito nativo do WhatsApp
 * - Garante encerramento padrão institucional exatamente UMA vez
 * - Normaliza caracteres em UTF-8
 */
export function sanitizeCordialMessageForWhatsApp(
  rawText: string,
  params: {
    userName: string;
    normTitle: string;
    rawContext?: string;
    normSection?: string;
  }
): string {
  if (!rawText) return '';
  let msg = rawText.trim();

  const { salutation, firstName } = getSalutationForName(params.userName);
  const cleanSection = params.normSection ? String(params.normSection).replace(/[^0-9]/g, '') || String(params.normSection) : '';
  const expectedSaudacao = salutation === 'querido' ? `*Querido ${firstName}!*` : `*Querida ${firstName}!*`;

  // 1. Converte asteriscos duplos (**) para simples (*)
  msg = msg.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*\*/g, '*');

  // 2. Garante saudação estrita do modelo
  if (!msg.startsWith(expectedSaudacao)) {
    msg = msg.replace(
      /^(?:\*?Olá,?\s*)?(?:\*?Querid[oa]\s+[A-Za-zÀ-ÿ]+!?\*?|\*?[A-Za-zÀ-ÿ]+!?\*?)\s*\n+/i,
      ''
    );
    msg = `${expectedSaudacao}\n\n${msg.trim()}`;
  }

  // 3. Remove rigorosamente qualquer assinatura prévia ou duplicada
  msg = stripTrailingFeedbackSignatures(msg);

  // 4. Aplica encerramento institucional padronizado do modelo exatamente UMA vez
  msg = `${msg.trim()}\n\n${STANDARD_FEEDBACK_CLOSING}`;

  // 5. Normalização UTF-8
  return msg
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}
