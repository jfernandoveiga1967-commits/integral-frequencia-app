/**
 * Utilitário de Geração de Prompts e Mensagens de Feedback Pedagógico Cordial
 * Estruturado nos 3 Pilares Pedagógicos Reflexivos (Contexto, Razão da Norma, Benefício)
 * com Comunicação Não-Violenta (CNV), flexão estrita de gênero e formatação nativa para WhatsApp (*).
 */

import { getSalutationForName } from './genderUtils';

export type FeedbackNormTheme =
  | 'alimentacao'
  | 'fardamento'
  | 'celular_radio'
  | 'parque_seguranca'
  | 'sensivel_acolhimento'
  | 'transporte_portao'
  | 'licao_estudo'
  | 'geral';

export interface DynamicFeedbackParams {
  userName: string;
  normTitle: string;
  rawContext: string;
  normSection?: string;
  normDetails?: string[];
}

export interface DynamicFeedbackResult {
  message: string;
  actionPoints: string[];
}

/**
 * Detecta a categoria temática central da norma e do contexto para adaptação de vocabulário e tom
 */
export function detectNormTheme(
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[]
): FeedbackNormTheme {
  const combined = [
    normTitle || '',
    rawContext || '',
    normSection || '',
    Array.isArray(normDetails) ? normDetails.join(' ') : '',
  ]
    .join(' ')
    .toLowerCase();

  if (
    /almoço|jantar|lanche|refeição|refeitório|comida|prato|talher|engasgo|mastigação|alérgeno|nutri/i.test(
      combined
    )
  ) {
    return 'alimentacao';
  }
  if (
    /uniforme|fardamento|roupa|vestimenta|camisa|avental|calçado|tênis|chinelo|crachá|maiô|sunga/i.test(
      combined
    )
  ) {
    return 'fardamento';
  }
  if (
    /celular|telefone|zap|whatsapp|rádio|comunicador|fone|rede social|foto|filmagem|dispersão/i.test(
      combined
    )
  ) {
    return 'celular_radio';
  }
  if (
    /parque|parcão|brinquedo|escorregador|balanço|queda|pátio|área externa|quadra|desnível/i.test(
      combined
    )
  ) {
    return 'parque_seguranca';
  }
  if (
    /choro|mordida|birra|grito|conflito|briga|acolhimento|sono|fralda|machucou|desfralde|abraço|emoção/i.test(
      combined
    )
  ) {
    return 'sensivel_acolhimento';
  }
  if (
    /van|ônibus|transporte|rampa|portão|portaria|calçada|embarque|desembarque|saída|catraca|academia|deslocamento|transição|transicoes/i.test(
      combined
    )
  ) {
    return 'transporte_portao';
  }
  if (/lição|dever|tarefa|caderno|estudo|reforço|sala de estudos/i.test(combined)) {
    return 'licao_estudo';
  }

  return 'geral';
}

/**
 * Constrói a mensagem pedagógica fundamentada nos 3 Pilares Reflexivos:
 * - Pilar 1 (Contexto): Situação observada acolhida no dinamismo da rotina escolar diária.
 * - Pilar 2 (A Razão da Norma): Justificativa pedagógica e operacional profunda da diretriz.
 * - Pilar 3 (O Benefício): Ganhos concretos para as crianças, para a monitora e para o colégio.
 * Formatação: WhatsApp Markdown nativo com asterisco simples (*) e flexão rigorosa de gênero.
 */
export function buildDynamicPedagogicalFeedback({
  userName,
  normTitle,
  rawContext,
  normSection,
  normDetails,
}: DynamicFeedbackParams): DynamicFeedbackResult {
  const { salutation, firstName } = getSalutationForName(userName);
  const cleanSection = normSection ? String(normSection).replace(/[^0-9]/g, '') || String(normSection) : '';
  const sectionLabel = cleanSection ? ` (Seção ${cleanSection})` : '';
  const cleanNormTitle = (normTitle || '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const normFullRef = `*“${cleanNormTitle}”${sectionLabel}*`;
  const cleanContext = (rawContext || '').trim();

  const theme = detectNormTheme(cleanNormTitle, cleanContext, normSection, normDetails);

  // Síntese cordial da situação vinculada à norma
  let situacaoResumo = '';
  let acaoOrientativa = '';
  let actionPoints: string[] = [];

  switch (theme) {
    case 'transporte_portao':
      situacaoResumo = cleanContext || 'a condução e supervisão atenta dos alunos durante as transições de espaços e atividades da academia';
      acaoOrientativa = 'a conferência nominal contínua e a condução atenta dos alunos em fila organizada, assegurando a supervisão integral em todos os deslocamentos';
      actionPoints = [
        'Conferir nominalmente todas as crianças antes e depois de cada transição ou deslocamento.',
        'Manter os alunos em fila organizada e segura durante as passagens por rampas, escadas e portões.',
        'Garantir vigilância visual constante e cobertura dos pontos cegos durante a locomoção do grupo.',
      ];
      break;

    case 'alimentacao':
      situacaoResumo = cleanContext || 'o acompanhamento próximo e atencioso dos alunos durante os momentos de refeições e lanches';
      acaoOrientativa = 'a vigilância ativa para prevenção de engasgos, a atenção a restrições alimentares e o estímulo afetuoso aos bons hábitos à mesa';
      actionPoints = [
        'Acompanhar de perto a mastigação e postura das crianças durante as refeições, prevenindo riscos de engasgo.',
        'Verificar rigorosamente os registros de restrições alimentares e alergias antes da oferta de qualquer alimento.',
        'Estimular a autonomia dos alunos com orientação afetuosa e organização dos talheres e bandejas.',
      ];
      break;

    case 'fardamento':
      situacaoResumo = cleanContext || 'a utilização completa do fardamento institucional e crachá de identificação durante os atendimentos';
      acaoOrientativa = 'a identificação visual imediata de toda a equipe para garantir a proteção institucional e a segurança das crianças';
      actionPoints = [
        'Utilizar o uniforme completo e o crachá funcional em todos os momentos de atendimento aos alunos.',
        'Reconhecer o fardamento como salvaguarda institucional e barreira de segurança escolar.',
        'Comunicar a coordenação previamente caso haja necessidade de reposição ou ajuste em qualquer peça.',
      ];
      break;

    case 'celular_radio':
      situacaoResumo = cleanContext || 'a atenção visual ininterrupta com as crianças e o uso do rádio comunicador institucional';
      acaoOrientativa = 'a presença integral de 360° voltada ao cuidado das crianças e a prontidão no canal oficial do rádio comunicador';
      actionPoints = [
        'Manter o foco visual contínuo e a atenção 100% voltada aos alunos durante todo o turno de monitoria.',
        'Utilizar o rádio comunicador como canal oficial de suporte imediato com a coordenação e equipe.',
        'Guardar aparelhos celulares pessoais durante o período com as crianças, utilizando-os apenas nos intervalos regulamentares.',
      ];
      break;

    case 'parque_seguranca':
      situacaoResumo = cleanContext || 'o acompanhamento preventivo e posicionamento estratégico durante as brincadeiras e atividades no parque';
      acaoOrientativa = 'a supervisão atenta em brinquedos elevados e a intervenção preventiva amorosa para evitar acidentes';
      actionPoints = [
        'Posicionar-se estrategicamente no parque com visão panorâmica de todos os brinquedos e pontos de maior altura.',
        'Intervir de forma preventiva e afetuosa diante de comportamentos que ofereçam risco de queda ou colisão.',
        'Inspecionar previamente os brinquedos e comunicar qualquer necessidade de reparo ou manutenção.',
      ];
      break;

    case 'sensivel_acolhimento':
      situacaoResumo = cleanContext || 'a mediação paciente, o acolhimento afetuoso e a escuta atenta em momentos sensíveis das crianças';
      acaoOrientativa = 'a abordagem acolhedora na altura dos olhos, sem rótulos ou repreensões punitivas, ensinando a regulação emocional';
      actionPoints = [
        'Acolher os momentos de choro ou frustração na altura dos olhos da criança, com tom sereno e escuta paciente.',
        'Mediar conflitos entre alunos incentivando a empatia, o diálogo fraterno e o respeito mútuo.',
        'Reportar ocorrências socioemocionais relevantes à coordenação para acompanhamento junto às famílias.',
      ];
      break;

    case 'licao_estudo':
      situacaoResumo = cleanContext || 'a mediação paciente e o incentivo ao foco durante os momentos de estudo e lição de casa';
      acaoOrientativa = 'a organização de um ambiente silencioso, motivador e propício ao desenvolvimento da autonomia nos estudos';
      actionPoints = [
        'Organizar o ambiente de estudo garantindo tranquilidade, iluminação e recursos necessários.',
        'Auxiliar os alunos a tirarem dúvidas estimulando a reflexão autônoma e o capricho com os cadernos.',
        'Registrar no controle pedagógico a conclusão das tarefas e eventuais dificuldades pontuais.',
      ];
      break;

    default:
      situacaoResumo = cleanContext || 'o acompanhamento preventivo e o cuidado dedicado às crianças durante as atividades da rotina do Integral';
      acaoOrientativa = 'o seguimento rigoroso aos procedimentos institucionais para resguardar a integridade física e o bem-estar dos alunos';
      actionPoints = [
        `Revisar e praticar a orientação prevista na norma "${cleanNormTitle}"${sectionLabel}.`,
        'Manter a prioridade absoluta na segurança física e proteção socioemocional dos alunos.',
        'Acionar a coordenação proativamente diante de qualquer dúvida ou situação atípica na rotina.',
      ];
      break;
  }

  // Se houver detalhes específicos da norma, incorpora no checklist se não estiver presente
  if (Array.isArray(normDetails) && normDetails.length > 0) {
    const customPoint = normDetails[0].trim();
    if (customPoint && !actionPoints.some((p) => p.includes(customPoint))) {
      actionPoints.splice(1, 0, `Observar a orientação específica: ${customPoint}`);
    }
  }

  const saudacao = salutation === 'querido' ? `*Querido ${firstName}!*` : `*Querida ${firstName}!*`;

  const message = `${saudacao}

Esperamos que você esteja bem. Gostaríamos de começar agradecendo pelo seu empenho e pela dedicação diária aos nossos alunos no Programa do Integral do Colégio Crescer.

Gostaríamos de retomar uma situação ocorrida durante a rotina: ${situacaoResumo}.

Sabemos que a rotina do Integral exige atenção constante, organização e cuidado com diferentes necessidades das crianças. Ainda assim, situações como essa reforçam a importância de seguirmos rigorosamente os procedimentos de segurança em todos os deslocamentos.

Por isso, retomamos a orientação prevista na norma institucional ${normFullRef}, destacando ${acaoOrientativa}.

Mais do que uma etapa da rotina, a atenção a este procedimento é uma medida indispensável de segurança e responsabilidade coletiva. A atenção a esse procedimento contribui diretamente para a proteção e o bem-estar das crianças sob nossos cuidados.

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
 * seguindo ESTRITAMENTE o modelo obrigatório de saída de Comunicação Não-Violenta (CNV)
 */
export function buildGeminiFeedbackSystemPrompt({
  userName,
  normTitle,
  rawContext,
  normSection,
  normDetails,
}: DynamicFeedbackParams): string {
  const { salutation, firstName } = getSalutationForName(userName);
  const cleanSection = normSection ? String(normSection).replace(/[^0-9]/g, '') || String(normSection) : '';
  const sectionLabel = cleanSection ? ` (Seção ${cleanSection})` : '';
  const cleanNormTitle = (normTitle || '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const cleanContext = (rawContext || '').trim();
  const saudacao = salutation === 'querido' ? `*Querido ${firstName}!*` : `*Querida ${firstName}!*`;

  return `Você é a Coordenação do Programa do Período Integral do Colégio Crescer.
Sua missão é gerar um Feedback Pedagógico Cordial individual para o(a) colaborador(a) ${userName}, fundamentado estritamente nos princípios da Comunicação Não-Violenta (CNV), tom acolhedor, respeito mútuo e compromisso inegociável com a segurança e bem-estar das crianças.

DIRETRIZ CRÍTICA: Você DEVE SEGUIR RIGOROSAMENTE A ESTRUTURA E OS PARÁGRAFOS DO MODELO OBRIGATÓRIO DE SAÍDA ABAIXO:

--------------------------------------------------
MODELO OBRIGATÓRIO DE SAÍDA:

${saudacao}

Esperamos que você esteja bem. Gostaríamos de começar agradecendo pelo seu empenho e pela dedicação diária aos nossos alunos no Programa do Integral do Colégio Crescer.

Gostaríamos de retomar uma situação ocorrida durante a rotina: [Resumo cordial da situação vinculada à norma selecionada].

Sabemos que a rotina do Integral exige atenção constante, organização e cuidado com diferentes necessidades das crianças. Ainda assim, situações como essa reforçam a importância de seguirmos rigorosamente os procedimentos de segurança em todos os deslocamentos.

Por isso, retomamos a orientação prevista na norma institucional *“${cleanNormTitle}”${sectionLabel}*, destacando [Ação orientativa e preventiva esperada da norma].

Mais do que uma etapa da rotina, a atenção a este procedimento é uma medida indispensável de segurança e responsabilidade coletiva. A atenção a esse procedimento contribui diretamente para a proteção e o bem-estar das crianças sob nossos cuidados.

Contamos com seu compromisso para reforçar essa prática em todos os momentos, mantendo a atenção necessária para que situações semelhantes sejam prevenidas.

Agradecemos sua compreensão e parceria na construção de uma rotina cada vez mais segura e cuidadosa para nossos alunos.

*Atenciosamente*,
Coordenação do Integral
Colégio Crescer
--------------------------------------------------

INSTRUÇÕES DE PREENCHIMENTO DOS CAMPOS ENTRE COLCHETES:
1. Saudação: DEVE ser exatamente "${saudacao}" em negrito com asterisco (*).
2. [Resumo cordial da situação vinculada à norma selecionada]:
   ${cleanContext ? `Integre o seguinte fato com cordialidade e acolhimento: "${cleanContext}"` : `Sintetize cordialmente uma situação típica da rotina escolar referente à norma "${cleanNormTitle}"${sectionLabel}, mantendo tom afetuoso e acolhedor.`}
3. [Ação orientativa e preventiva esperada da norma]:
   Explique de maneira clara, orientativa e construtiva a ação esperada da colaboradora com base na norma institucional "${cleanNormTitle}"${sectionLabel}.
4. Encerramento: Finalize ESTRITAMENTE com:
*Atenciosamente*,
Coordenação do Integral
Colégio Crescer

Dados da Norma Selecionada:
- Colaborador(a): ${userName}
- Norma: "${cleanNormTitle}"${sectionLabel}
- Detalhes do Manual: ${Array.isArray(normDetails) && normDetails.length > 0 ? normDetails.join('; ') : 'Manual de Normas e Conduta do Colégio Crescer'}

Gere a resposta estritamente em formato JSON com o seguinte schema:
{
  "message": "Texto completo da mensagem exatamente nos parágrafos do modelo obrigatório, mantendo os destaques em *",
  "actionPoints": [
    "Item 1 prático do checklist de ciência da monitora para assinar no app",
    "Item 2 prático do checklist de ciência da monitora para assinar no app",
    "Item 3 prático do checklist de ciência da monitora para assinar no app"
  ]
}`;
}

/**
 * Sanitiza e valida a mensagem cordial para WhatsApp e para o sistema:
 * - Mantém a saudação obrigatória (*Querida [Nome]!* ou *Querido [Nome]!*)
 * - Converte asteriscos duplos (**) em simples (*) para negrito nativo do WhatsApp
 * - Garante encerramento padrão institucional
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
  const sectionLabel = cleanSection ? ` (Seção ${cleanSection})` : '';
  const cleanTitle = (params.normTitle || '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const expectedSaudacao = salutation === 'querido' ? `*Querido ${firstName}!*` : `*Querida ${firstName}!*`;

  // 1. Converte asteriscos duplos (**) para simples (*)
  msg = msg.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*\*/g, '*');

  // 2. Garante saudação estrita do modelo
  if (!msg.startsWith(expectedSaudacao)) {
    // Se começou com outro tipo de saudação (ex: "Olá, querida Amanda!", "Querida Amanda!"), ajusta
    msg = msg.replace(
      /^(?:\*?Olá,?\s*)?(?:\*?Querid[oa]\s+[A-Za-zÀ-ÿ]+!?\*?|\*?[A-Za-zÀ-ÿ]+!?\*?)\s*\n+/i,
      ''
    );
    msg = `${expectedSaudacao}\n\n${msg.trim()}`;
  }

  // 3. Remove eventuais assinaturas redundantes
  msg = msg.replace(
    /\n+(?:\*?Um abraço fraterno\*?,?|\*?Atenciosamente\*?,?|\*?Fraternalmente\*?,?|\*?Com carinho\*?,?)\s*\n+[\s\S]*$/is,
    ''
  );
  msg = msg.replace(/\n+\*?Coordenação (?:do Integral|Pedagógica)[\s\S]*$/is, '');
  msg = msg.replace(/\n+\*?Colégio Crescer\*?[\s\S]*$/is, '');

  // 4. Aplica encerramento institucional padronizado do modelo
  const finalClosing = '*Atenciosamente*,\nCoordenação do Integral\nColégio Crescer';
  msg = `${msg.trim()}\n\n${finalClosing}`;

  // 5. Normalização UTF-8
  return msg
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

