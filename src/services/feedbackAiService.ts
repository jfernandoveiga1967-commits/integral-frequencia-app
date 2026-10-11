/**
 * Serviço de IA Generativa para Elaboração de Feedback Cordial por Norma
 * Fundamentado nos princípios da Comunicação Não-Violenta (CNV) e no cuidado
 * e segurança integral das crianças do Colégio Crescer.
 */

export interface CordialFeedbackResult {
  message: string;
  actionPoints: string[];
  isAiGenerated: boolean;
}

/**
 * Heurística pedagógica de contingência (CNV) caso a API externa esteja indisponível
 */
function buildFallbackCordialMessage(
  userName: string,
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[]
): { message: string; actionPoints: string[] } {
  const firstName = (userName || 'Colaboradora').split(' ')[0];
  const sectionLabel = normSection ? ` (Seção ${normSection})` : '';

  const message = `Olá, querida ${firstName}!

Esperamos que seu dia esteja sendo abençoado. Gostaríamos de começar expressando nosso sincero agradecimento pelo seu carinho, dedicação e energia investidos diariamente no acompanhamento dos nossos pequenos no Programa do Integral do Colégio Crescer. Seu papel é fundamental na vida de cada criança!

No espírito de diálogo aberto e contínuo aprimoramento da nossa equipe, gostaríamos de compartilhar uma orientação construtiva sobre uma situação observada recentemente:
"${rawContext.trim()}"

Gostaríamos de revisitar com você a norma institucional "${normTitle}"${sectionLabel}. No Colégio Crescer, cada uma dessas diretrizes existe com um único propósito supremo: garantir a integridade física, o acolhimento emocional e a segurança permanente de todas as crianças sob nossa responsabilidade. Quando zelamos por esses detalhes da rotina, construímos um ambiente verdadeiramente protegido e sereno para que os alunos possam florescer.

Contamos imensamente com a sua sensibilidade e parceria para mantermos esse alinhamento no dia a dia. Você faz a diferença em nosso colégio!

Um abraço fraterno,
Coordenação Pedagógica • Colégio Crescer`;

  const actionPoints = [
    `Revisar e praticar a diretriz institucional "${normTitle}"${sectionLabel} durante toda a rotina de atendimento.`,
    'Manter foco prioritário e atenção constante na segurança física, bem-estar e integridade dos alunos.',
    'Buscar proativamente o apoio da coordenação ou de colegas sempre que surgirem dúvidas ou desafios na condução da turma.',
  ];

  if (Array.isArray(normDetails) && normDetails.length > 0) {
    const customPoint = normDetails[0].trim();
    if (customPoint && !actionPoints.includes(customPoint)) {
      actionPoints.splice(1, 0, `Observar a orientação específica: ${customPoint}`);
    }
  }

  return { message, actionPoints };
}

/**
 * Gera mensagem de feedback cordial orientada pela CNV via Gemini API no servidor
 * com fallback transparente e resiliente.
 */
export async function generateCordialFeedback(
  userName: string,
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[]
): Promise<CordialFeedbackResult> {
  const cleanName = (userName || '').trim() || 'Monitora';
  const cleanNorm = (normTitle || '').trim() || 'Norma Institucional';
  const cleanContext = (rawContext || '').trim();

  try {
    const response = await fetch('/api/gemini/generate-cordial-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName: cleanName,
        normTitle: cleanNorm,
        normSection,
        rawContext: cleanContext,
        normDetails,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.feedback?.message) {
        let actionPoints: string[] = Array.isArray(data.feedback.actionPoints) && data.feedback.actionPoints.length > 0
          ? data.feedback.actionPoints
          : [
              `Alinhamento integral com a norma "${cleanNorm}"`,
              'Zelo redobrado pela segurança e bem-estar das crianças',
              'Prática constante da escuta atenta e do acolhimento na rotina',
            ];

        return {
          message: data.feedback.message,
          actionPoints,
          isAiGenerated: true,
        };
      }
    }
  } catch (error) {
    console.warn('[feedbackAiService] Aviso na geração via servidor, acionando fallback CNV:', error);
  }

  // Fallback heurístico CNV
  const fallback = buildFallbackCordialMessage(cleanName, cleanNorm, cleanContext, normSection, normDetails);
  return {
    message: fallback.message,
    actionPoints: fallback.actionPoints,
    isAiGenerated: false,
  };
}
