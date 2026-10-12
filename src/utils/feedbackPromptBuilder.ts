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
    /van|ônibus|transporte|rampa|portão|portaria|calçada|embarque|desembarque|saída|catraca/i.test(
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
  const sectionLabel = normSection ? ` (Seção ${normSection})` : '';
  const normFullRef = `"${normTitle}"${sectionLabel}`;
  const cleanContext = (rawContext || '').trim();

  const theme = detectNormTheme(normTitle, cleanContext, normSection, normDetails);

  let pilar1 = '';
  let pilar2 = '';
  let pilar3 = '';
  let actionPoints: string[] = [];

  switch (theme) {
    case 'alimentacao':
      pilar1 = `Durante a rotina de alimentação e momentos de lanche com a turma, observamos a seguinte situação: *"${cleanContext}"*. Reconhecemos o quanto a dinâmica das refeições exige presença ativa, agilidade e atenção individualizada a cada criança.`;
      pilar2 = `Por essa razão, gostaríamos de revisitar a diretriz institucional *${normFullRef}*. No Colégio Crescer, cada procedimento alimentar existe para garantir a segurança biológica dos alunos, prevenindo com rigor engasgos, contaminações cruzadas e riscos com alérgenos, além de cultivar a autonomia, bons hábitos e tranquilidade à mesa.`;
      pilar3 = `Quando seguimos esses cuidados com dedicação, garantimos a integridade física e o bem-estar dos nossos pequenos, proporcionamos a você a tranquilidade de um ambiente seguro e controlado, e honramos a confiança irrestrita que as famílias depositam em nossa escola.`;
      actionPoints = [
        'Acompanhar de perto a postura das crianças durante as refeições, zelando pela mastigação segura e prevenção de engasgos.',
        'Seguir com rigor as orientações de segurança alimentar e alérgenos descritas na norma do Colégio Crescer.',
        'Estimular a autonomia e hábitos saudáveis dos pequenos com incentivo afetuoso e vigilância atenta.',
      ];
      break;

    case 'fardamento':
      pilar1 = `No cotidiano dinâmico do Período Integral, registramos o seguinte ponto para alinhamento fraterno: *"${cleanContext}"*. Valorizamos profundamente sua dedicação diária e sua presença ativa no acolhimento das nossas turmas.`;
      pilar2 = `Gostaríamos de relembrar o propósito da norma institucional *${normFullRef}*. O fardamento completo e a identificação funcional não são formalidades burocráticas; são elementos essenciais de segurança escolar. Eles asseguram que alunos, colegas, famílias e funcionários da portaria identifiquem imediatamente as monitoras em qualquer setor, garantindo clareza institucional e proteção contínua dos espaços.`;
      pilar3 = `O cumprimento desse alinhamento reforça sua postura profissional e autoridade acolhedora perante a comunidade escolar, protege e respalda sua atuação e consolida a organização e excelência que caracterizam o Colégio Crescer.`;
      actionPoints = [
        'Utilizar o fardamento e crachá institucional completo e adequado em todos os momentos da rotina escolar.',
        'Compreender o uniforme como barreira ativa de segurança e identificação imediata das crianças e da equipe.',
        'Contatar a coordenação com antecedência caso necessite de reposição ou ajuste em qualquer peça de uniforme.',
      ];
      break;

    case 'celular_radio':
      pilar1 = `No andamento das atividades e acompanhamento dos alunos, identificamos a seguinte situação para reflexão conjunta: *"${cleanContext}"*. Compreendemos a multiplicidade de estímulos que acontecem simultaneamente no dia a dia do Integral.`;
      pilar2 = `Por isso, é fundamental refletirmos sobre a diretriz *${normFullRef}*. Na monitoria infantil, a presença atenta e o contato visual ininterrupto de 360° são as maiores salvaguardas preventivas. Dispositivos móveis pessoais fragmentam essa atenção nos momentos com as crianças, ao passo que o rádio comunicador é o canal oficial vital para garantir comunicação ágil e resposta imediata da equipe em qualquer necessidade.`;
      pilar3 = `Com a sua atenção integral voltada para o grupo, as crianças sentem-se plenamente cuidadas e protegidas, você trabalha com respaldo total e prontidão operativa, e o colégio assegura o mais alto padrão de prevenção e excelência.`;
      actionPoints = [
        'Manter o foco visual e a presença integral voltados exclusivamente para as crianças durante todo o período da monitoria.',
        'Utilizar o rádio comunicador institucional como canal prioritário e ágil de alinhamento com a equipe e coordenação.',
        'Guardar aparelhos celulares pessoais nos locais apropriados, reservando o uso exclusivamente para os intervalos regulamentares.',
      ];
      break;

    case 'parque_seguranca':
      pilar1 = `Nas vivências e brincadeiras ao ar livre com a turma, acompanhamos o seguinte episódio que requer nossa atenção: *"${cleanContext}"*. Sabemos o quanto a recreação no parque é alegre e exige energia redobrada da monitoria.`;
      pilar2 = `Diante disso, é indispensável resgatarmos os fundamentos da diretriz *${normFullRef}*. Em brinquedos elevados e áreas abertas, o posicionamento estratégico e a visão periférica constante da monitora antecipam riscos de queda, evitam disputas acaloradas e garantem que as brincadeiras ocorram em clima harmônico e seguro.`;
      pilar3 = `Essa supervisão vigilante e amorosa preserva a integridade física de cada aluno, confere a você a tranquilidade de conduzir a turma com controle preventivo e reafirma a máxima segurança que os pais confiam ao Colégio Crescer.`;
      actionPoints = [
        'Posicionar-se estrategicamente nas áreas do parque com cobertura visual contínua dos pontos de maior risco e altura.',
        'Antecipar movimentos perigosos e orientar as crianças de maneira firme, afetuosa e preventiva.',
        'Inspecionar previamente os brinquedos e acionar imediatamente a manutenção ou coordenação caso identifique qualquer anomalia.',
      ];
      break;

    case 'sensivel_acolhimento':
      pilar1 = `Em um momento delicado e sensível da convivência com as crianças, observamos a seguinte ocorrência: *"${cleanContext}"*. Sabemos que lidar com o choro, desregulação emocional, mordidas ou conflitos infantis desafia diariamente nossa sensibilidade e paciência.`;
      pilar2 = `Por essa razão, gostaríamos de revisitar a conduta pedagógica acolhedora preconizada em *${normFullRef}*. No Colégio Crescer, todo conflito ou choro é uma rica oportunidade educativa. Nossa postura deve ser sempre de porto seguro: abaixar-se na altura dos olhos, acolher sem rotulações ou tom punitivo e ensinar a criança a expressar sentimentos e respeitar os colegas.`;
      pilar3 = `Ao agir com essa sensibilidade, você constrói laços profundos de confiança e afeto com a turma, cria um ambiente emocionalmente saudável para todos e personifica a verdadeira essência da pedagogia do cuidado que orienta nossa escola.`;
      actionPoints = [
        'Acolher as manifestações emocionais das crianças na altura dos olhos, com tom de voz sereno e sem julgamentos.',
        'Mediar conflitos infantis orientando para a empatia, o diálogo fraterno e a reparação respeitosa.',
        'Registrar e comunicar à coordenação ocorrências sensíveis para apoio integrado com as famílias.',
      ];
      break;

    case 'transporte_portao':
      pilar1 = `Durante os horários de transição, embarque ou saída das turmas, registramos a seguinte situação: *"${cleanContext}"*. Reconhecemos o dinamismo intenso e a agilidade exigidos nos momentos de portaria e transporte escolar.`;
      pilar2 = `Reforçamos a extrema importância da norma institucional *${normFullRef}*. Os momentos de chegada, saída e condução de alunos requerem conferência nominal rigorosa, deslocamento seguro de mãos dadas e controle visual estrito de portões, garantindo que nenhuma criança saia desacompanhada ou seja entregue sem confirmação de responsável autorizado.`;
      pilar3 = `Essa exatidão operacional assegura que cada criança retorne ao seu lar em total segurança, concede respaldo inquestionável à sua atuação profissional e honra a responsabilidade sagrada que temos perante as famílias.`;
      actionPoints = [
        'Conferir rigorosamente as listas de presença e identificação dos alunos no embarque e desembarque.',
        'Manter controle visual irrestrito nos portões e rampas de acesso, impedindo deslocamentos sem supervisão direta.',
        'Acionar a coordenação ou recepção imediatamente em qualquer divergência de autorização de saída.',
      ];
      break;

    case 'licao_estudo':
      pilar1 = `No momento dedicado às tarefas escolares e estudo orientado, acompanhamos o seguinte episódio: *"${cleanContext}"*. Valorizamos muito a dedicação e o carinho com que você guia as turmas nos momentos de aprendizagem.`;
      pilar2 = `Gostaríamos de retomar as diretrizes pedagógicas de *${normFullRef}*. O momento de estudos no Integral deve propiciar foco, silêncio acolhedor e esclarecimento paciente de dúvidas, desenvolvendo a autonomia, organização dos cadernos e prazer pelo conhecimento.`;
      pilar3 = `Essa condução estruturada incentiva a responsabilidade dos alunos, diminui as sobrecargas noturnas das famílias e fortalece o alinhamento pedagógico de excelência do nosso colégio.`;
      actionPoints = [
        'Organizar o espaço de estudos garantindo iluminação, silêncio e materiais necessários.',
        'Acompanhar as dúvidas dos alunos incentivando a reflexão autônoma e o capricho com os cadernos.',
        'Anotar no controle diário a realização das tarefas e eventuais dificuldades para devolutiva à coordenação.',
      ];
      break;

    default:
      pilar1 = `No fluxo diário das atividades e convivência no Programa do Integral, gostaríamos de compartilhar uma observação construtiva sobre uma situação recente: *"${cleanContext}"*. Reconhecemos sua energia contínua e a importância do seu papel junto aos alunos.`;
      pilar2 = `Por isso, revisitamos conjuntamente a diretriz institucional *${normFullRef}*. No Colégio Crescer, cada norma do Manual foi elaborada com o objetivo supremo de resguardar a integridade física, o acolhimento socioemocional e a harmonia das rotinas, estabelecendo padrões claros de proteção a toda a comunidade escolar.`;
      pilar3 = `Ao mantermos essa prática alinhada no dia a dia, preservamos a segurança e a alegria dos nossos pequenos, proporcionamos estabilidade e pleno respaldo à sua atuação funcional e consolidamos o padrão de excelência da nossa escola.`;
      actionPoints = [
        `Revisar e praticar a diretriz institucional "${normTitle}"${sectionLabel} durante toda a rotina de atendimento.`,
        'Manter foco prioritário e atenção constante na segurança física, bem-estar e integridade dos alunos.',
        'Buscar proativamente o apoio da coordenação ou de colegas sempre que surgirem dúvidas ou desafios na condução da turma.',
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

  const message = `Olá, ${salutation} ${firstName}!

Esperamos que você esteja bem. Gostaríamos de começar agradecendo pelo seu carinho e dedicação diária com os nossos alunos no Programa do Integral do Colégio Crescer.

${pilar1}

${pilar2}

${pilar3}

Contamos com a sua costumeira sensibilidade e compromisso para fortalecermos esse alinhamento no dia a dia. Você é peça fundamental em nossa equipe!

Atenciosamente,
Coordenação do Integral • Colégio Crescer`;

  return {
    message: sanitizeCordialMessageForWhatsApp(message, {
      userName,
      normTitle,
      rawContext,
      normSection,
    }),
    actionPoints,
  };
}

/**
 * Constrói o System Prompt detalhado para o Gemini (Flash)
 * estruturando a geração nos 3 Pilares Pedagógicos e garantindo versatilidade temática.
 */
export function buildGeminiFeedbackSystemPrompt({
  userName,
  normTitle,
  rawContext,
  normSection,
  normDetails,
}: DynamicFeedbackParams): string {
  const { salutation, firstName } = getSalutationForName(userName);
  const sectionLabel = normSection ? ` (Seção ${normSection})` : '';
  const normFullRef = `"${normTitle}"${sectionLabel}`;
  const cleanContext = (rawContext || '').trim();

  return `Você é a Coordenação Pedagógica do Colégio Crescer (Programa do Período Integral).
Sua missão é redigir uma orientação pedagógica individual acolhedora, humana e construtiva, fundamentada estritamente na Comunicação Não-Violenta (CNV), para o(a) colaborador(a) ${userName}.

O texto deve ser versátil, dinâmico, sensível e estruturado OBRIGATORIAMENTE nos 3 Pilares Pedagógicos Reflexivos:

1. ESTRUTURA REFLEXIVA DOS 3 PILARES PEDAGÓGICOS:
   - Pilar 1 (Contexto Acolhedor na Rotina):
     Inicie reconhecendo com carinho a dedicação diária do colaborador com as crianças no Integral. Em seguida, apresente a situação observada (${cleanContext}) de forma acolhedora, respeitosa e natural no dinamismo da rotina diária. O fato observado DEVE vir destacado em negrito nativo com asterisco simples: *"${cleanContext}"*. Jamais utilize tom punitivo, acusatório ou repreensivo.
   - Pilar 2 (A Razão Pedagógica da Norma):
     Apresente a norma vinculada em negrito nativo com asterisco simples: *${normFullRef}*. Explique com profundidade a justificativa pedagógica e operacional por trás desta norma específica no Colégio Crescer. Vá além da regra: elucide o "porquê" protetivo e educativo na rotina das crianças.
   - Pilar 3 (O Benefício Coletivo e Individual):
     Destaque os ganhos concretos e palpáveis: a segurança física e socioemocional dos pequenos, a tranquilidade e respaldo profissional para a própria monitora no exercício de suas funções, e a excelência que as famílias confiam ao Colégio Crescer.

2. FLEXIBILIDADE E VARIABILIDADE TEMÁTICA (ANTI-REPETIÇÃO):
   - Evite frases genéricas e clichês pré-fabricados. Adapte o tom, vocabulário e analogias ao tema da norma:
     * Alimentação/Lanche: enfrente deglutição segura, prevenção a alergias e engasgo, incentivo afetivo à autonomia e higiene.
     * Fardamento/Identificação: aborde a pronta identificação visual em áreas comuns, proteção institucional e apresentação profissional acolhedora.
     * Rádio/Celular/Atenção Plena: enfatize a presença 100% conectada no olhar das crianças, atenção sem dispersão digital e prontidão ágil para suporte mútuo.
     * Parque/Área Externa: foque na visão periférica de 360°, prevenção ativa de quedas em brinquedos e mediação amorosa das brincadeiras.
     * Momentos Sensíveis (Choro, Mordida, Sono, Conflito): destaque o acolhimento empático, ausência de rótulos, regulação emocional serena e escuta atenta.
     * Transporte/Portão/Deslocamento: destaque o cuidado nas transições, conferência das crianças e segurança nos portões e rampas.
   - O texto deve soar pessoal, artesanal, afetuoso e profundamente pedagógico.

3. DIRETRIZES TÉCNICAS E DE FORMATAÇÃO:
   - Saudação Inicial Obrigatória (Concordância Estrita de Gênero):
     Inicie a mensagem OBRIGATORIAMENTE com: "Olá, ${salutation} ${firstName}!"
   - Negrito Nativo para WhatsApp (Asterisco Simples *):
     Utilize OBRIGATORIAMENTE asterisco simples (*) para negrito no WhatsApp:
     * Destaque o fato observado como: *"${cleanContext}"*
     * Destaque a norma e seção como: *${normFullRef}*
     * NUNCA use asteriscos duplos (**) no corpo da mensagem.
   - Encerramento Institucional Padronizado:
     Finalize a mensagem estritamente com:
Atenciosamente,
Coordenação do Integral • Colégio Crescer

Contexto Recebido:
- Colaborador(a): ${userName}
- Norma Institucional: ${normFullRef}
- Fato Observado: "${cleanContext}"
- Diretrizes da Norma: ${Array.isArray(normDetails) && normDetails.length > 0 ? normDetails.join('; ') : 'Manual de Normas e Conduta do Colégio Crescer'}

Gere uma resposta estritamente em JSON no seguinte formato:
{
  "message": "Texto completo da mensagem cordial iniciando em 'Olá, ${salutation} ${firstName}!' com os 3 pilares pedagógicos, destaques em * e finalizando em 'Coordenação do Integral • Colégio Crescer'",
  "actionPoints": [
    "Ponto prático 1 de atenção e cuidado que a monitora deve praticar na rotina",
    "Ponto prático 2 de alinhamento com a justificativa pedagógica da norma",
    "Ponto prático 3 de compromisso com a segurança e bem-estar dos alunos"
  ]
}`;
}

/**
 * Sanitiza e valida a mensagem cordial para WhatsApp e para o sistema:
 * - Garante concordância de gênero estrita na saudação ('Olá, querido/querida [Nome]!')
 * - Converte eventuais asteriscos duplos (**) em simples (*) para negrito nativo do WhatsApp
 * - Garante que o fato (*"fato"*) e a norma (*"norma"*) fiquem destacados
 * - Padroniza o encerramento institucional sem duplicações
 * - Normaliza caracteres e emojis em UTF-8
 */
export function sanitizeCordialMessageForWhatsApp(
  rawText: string,
  params: {
    userName: string;
    normTitle: string;
    rawContext: string;
    normSection?: string;
  }
): string {
  if (!rawText) return '';
  let msg = rawText.trim();

  const { salutation, firstName } = getSalutationForName(params.userName);
  const sectionLabel = params.normSection ? ` (Seção ${params.normSection})` : '';
  const normFullRef = `"${params.normTitle}"${sectionLabel}`;
  const rawTrimmed = (params.rawContext || '').trim();

  // 1. Converte asteriscos duplos (**) para simples (*)
  msg = msg.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*\*/g, '*');

  // 2. Garante saudação com flexão estrita de gênero
  if (!msg.startsWith(`Olá, ${salutation}`)) {
    msg = msg.replace(
      /^Olá,\s*(?:querid[oa]|colaborador[a]?|amig[oa])\s+[^!\n]+!/i,
      `Olá, ${salutation} ${firstName}!`
    );
    if (!msg.startsWith(`Olá, ${salutation}`)) {
      msg = `Olá, ${salutation} ${firstName}!\n\n${msg}`;
    }
  }

  // 3. Garante destaque em negrito no fato observado (*"fato"*)
  if (rawTrimmed) {
    const expectedFact = `*"${rawTrimmed}"*`;
    if (!msg.includes(expectedFact)) {
      if (msg.includes(`"${rawTrimmed}"`)) {
        msg = msg.replace(`"${rawTrimmed}"`, expectedFact);
      } else if (msg.includes(`*${rawTrimmed}*`)) {
        msg = msg.replace(`*${rawTrimmed}*`, expectedFact);
      } else if (msg.includes(rawTrimmed)) {
        msg = msg.replace(rawTrimmed, expectedFact);
      }
    }
  }

  // 4. Garante destaque em negrito na norma (*"norma" (Seção X)*)
  const expectedNorm = `*${normFullRef}*`;
  if (!msg.includes(expectedNorm)) {
    if (msg.includes(normFullRef)) {
      msg = msg.replace(normFullRef, expectedNorm);
    } else if (msg.includes(`"${params.normTitle}"`)) {
      msg = msg.replace(`"${params.normTitle}"`, expectedNorm);
    } else if (msg.includes(params.normTitle)) {
      msg = msg.replace(params.normTitle, expectedNorm);
    }
  }

  // 5. Remove eventuais assinaturas e saudações finais redundantes
  msg = msg.replace(
    /\n+(?:Um abraço fraterno,?|Atenciosamente,?|Fraternalmente,?|Com carinho,?)\s*\n+.*$/is,
    ''
  );
  msg = msg.replace(
    /\n+\*?(?:Coordenação (?:do Integral|Pedagógica) • Colégio Crescer)\*?$/is,
    ''
  );

  // 6. Aplica encerramento padronizado estrito
  const finalClosing = 'Atenciosamente,\nCoordenação do Integral • Colégio Crescer';
  msg = `${msg.trim()}\n\n${finalClosing}`;

  // 7. Sanitização UTF-8 e eliminação de caracteres inválidos
  return msg
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}
