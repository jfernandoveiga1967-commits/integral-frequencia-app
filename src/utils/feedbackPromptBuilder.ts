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

  const saudacao = salutation === 'querido' ? `**Querido ${firstName}!**` : `**Querida ${firstName}!**`;
  const cleanSituacaoResumo = situacaoResumo.replace(/[\.\s]+$/, '').trim();
  const cleanRazao = razaoProcedimento.replace(/[\.\s]+$/, '').trim();
  const cleanAcao = acaoOrientativa.replace(/[\.\s]+$/, '').trim();
  const normRefBold = cleanSection
    ? `**Manual de Normas e Conduta – Seção ${cleanSection}: ${cleanNormTitle}**`
    : `**Norma Institucional: ${cleanNormTitle}**`;

  const message = `${saudacao}

Agradecemos pela sua dedicação e pelo cuidado diário com os nossos alunos no Programa Integral do Colégio Crescer.

Escrevemos para apresentar uma orientação técnica e alinhar a rotina referente a ${cleanSituacaoResumo}.

Essa conduta está fundamentada nas diretrizes oficiais do ${normRefBold}, que estabelece ${cleanAcao}.

A observância rigorosa a este procedimento é indispensável para assegurar a organização institucional, a previsibilidade dos fluxos e a máxima segurança e bem-estar dos nossos alunos.

**Atenciosamente,**
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
 * garantindo mensagens institucionais técnicas, diretas, objetivas e contextualizadas
 * conforme o padrão oficial do Colégio Crescer.
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
  const saudacao = salutation === 'querido' ? `**Querido ${firstName}!**` : `**Querida ${firstName}!**`;
  const normRefBold = cleanSection
    ? `**Manual de Normas e Conduta – Seção ${cleanSection}: ${cleanNormTitle}**`
    : `**Norma Institucional: ${cleanNormTitle}**`;

  return `Você é a Coordenação do Programa Integral do Colégio Crescer.
Sua missão é redigir um Feedback Institucional e Pedagógico oficial, técnico, afetuoso e objetivo para o(a) colaborador(a) ${userName}, fundamentado nas normas e condutas oficiais da instituição.

==================================================
DIRETRIZES DE ENGENHARIA DE PROMPT (ESTRITAMENTE OBRIGATÓRIAS):

1. TOM E ESTILO:
- Formal, afetuoso porém altamente técnico e institucional.
- Seja direto, claro e profissional, expressando respeito e parceria educativa.
- É TERMINANTEMENTE PROIBIDO inventar fatos, florear, presumir acontecimentos não relatados ou incluir saudações motivacionais genéricas (ex.: proibidíssimo usar "esperamos que esteja bem", "que seu dia seja iluminado", clichês vazios de autoajuda).

2. FOCO NO TEMA INFORMADO:
- O assunto específico informado DEVE ser o centro imediato da mensagem (ex.: reforço escolar, horário do almoço, vestuário/uniforme, registro de ponto, conduta em passeios, atenção no parque).
- Não faça rodeios nem introduções prolixas. Vá direto ao ponto técnico do assunto.
- Dados específicos da orientação:
  * Colaborador(a): ${userName}
  * Norma Selecionada: "${cleanNormTitle}"${sectionLabel}
  * Detalhamento Oficial do Manual: ${Array.isArray(normDetails) && normDetails.length > 0 ? normDetails.join('; ') : 'Manual de Normas e Conduta do Colégio Crescer'}
  ${cleanCheckItem ? `* Item Específico do Checklist Observado: "${cleanCheckItem}"` : ''}
  ${cleanContext ? `* Contexto Adicional / Ocorrência Informada: "${cleanContext}"` : ''}

3. CITAÇÃO DE NORMAS:
- Vincule sempre a orientação de forma inequívoca à regra ou norma institucional correspondente do Manual do Colégio Crescer.
- A citação da norma DEVE vir destacada em negrito no corpo do texto: ${normRefBold}.

4. ESTRUTURA OBRIGATÓRIA DA MENSAGEM (6 BLOCOS SEQUENCIAIS ESTRITOS):
A mensagem final DEVE conter exatamente e sem desvios os seguintes parágrafos e elementos:

• BLOCO 1 - Saudação:
  ${saudacao}

• BLOCO 2 - Introdução:
  Agradecimento conciso pela dedicação ao Programa Integral do Colégio Crescer.
  (Exemplo: Agradecemos pela sua dedicação e pelo cuidado diário com os nossos alunos no Programa Integral do Colégio Crescer.)

• BLOCO 3 - Contexto Direto:
  Apresentação técnica da orientação/retomada de rotina com foco imediato no fato ou item informado (${cleanCheckItem || cleanContext || cleanNormTitle}), de forma transparente e acolhedora.

• BLOCO 4 - Fundamentação:
  Citação em negrito da norma institucional aplicável (${normRefBold}), explicitando com clareza o procedimento correto e o alinhamento esperado.

• BLOCO 5 - Justificativa Operacional:
  Exposição técnica e pedagógica do impacto do procedimento na organização, na segurança e no bem-estar integral dos alunos.

• BLOCO 6 - Encerramento e Assinatura Padronizada:
  Finalize ESTRITAMENTE com a assinatura oficial em 3 linhas:
**Atenciosamente,**
Coordenação do Integral
Colégio Crescer

==================================================
FORMATO DE SAÍDA OBRIGATÓRIO (JSON):
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem blocos markdown \`\`\`json em volta):
{
  "message": "Texto completo da mensagem nos 6 blocos obrigatórios, com formatação em negrito (**) na saudação, na citação da norma e na assinatura.",
  "actionPoints": [
    "Item 1 objetivo do checklist prático de ciência e alinhamento do colaborador",
    "Item 2 objetivo do checklist prático de ciência e alinhamento do colaborador",
    "Item 3 objetivo do checklist prático de ciência e alinhamento do colaborador"
  ]
}`;
}

export const STANDARD_FEEDBACK_CLOSING = '**Atenciosamente,**\nCoordenação do Integral\nColégio Crescer';

/**
 * Remove rigorosamente qualquer bloco de assinatura, despedida ou rodapé pré-existente
 * ao final do texto (inclusive variações com 'Equipe do Integral', 'Coordenação', etc.),
 * garantindo que assinaturas redundantes ou duplicadas sejam completamente eliminadas.
 */
export function stripTrailingFeedbackSignatures(text: string): string {
  if (!text) return '';
  let msg = text.trim();

  // Padrão abrangente para capturar despedidas no final da mensagem com * ou **
  const trailingSignatureRegex = /\n+\s*(?:\*{1,2})?(?:Atenciosamente|Um abraço(?: fraterno)?|Fraternalmente|Com carinho|Cordialmente|Abraços?)(?:\*{1,2})?,?.*$/is;

  // Padrão para capturar encerramentos de rodapé residuais (Coordenação / Equipe / Colégio Crescer)
  const trailingFooterRegex = /\n+\s*(?:\*{1,2})?(?:Coordenação (?:do Integral|Pedagógica)|Equipe (?:do Integral|Pedagógica)|Colégio Crescer)[\s\S]*$/is;

  let prev = '';
  while (msg !== prev) {
    prev = msg;
    msg = msg.replace(trailingSignatureRegex, '').trim();
    msg = msg.replace(trailingFooterRegex, '').trim();
  }

  return msg;
}

/**
 * Sanitiza e valida a mensagem institucional de feedback:
 * - Mantém a saudação obrigatória (**Querida [Nome]!** ou **Querido [Nome]!**)
 * - Preserva destaques em negrito (**) da norma e assinatura
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
  const expectedSaudacao = salutation === 'querido' ? `**Querido ${firstName}!**` : `**Querida ${firstName}!**`;

  // 1. Normaliza eventuais saudações com * para **
  msg = msg.replace(/^\*Querid([oa])\s+([A-Za-zÀ-ÿ]+)!\*/i, '**Querid$1 $2!**');

  // 2. Garante saudação estrita do modelo
  if (!msg.startsWith(expectedSaudacao)) {
    msg = msg.replace(
      /^(?:\*{1,2})?(?:Olá,?\s*)?(?:Querid[oa]\s+[A-Za-zÀ-ÿ]+!?|[A-Za-zÀ-ÿ]+!?)(?:\*{1,2})?\s*\n+/i,
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
