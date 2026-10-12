/**
 * Serviço de IA Generativa para Elaboração de Feedback Cordial por Norma
 * Fundamentado nos princípios da Comunicação Não-Violenta (CNV) e no cuidado
 * e segurança integral das crianças do Colégio Crescer.
 */

import { getSalutationForName } from '../utils/genderUtils';
import {
  buildDynamicPedagogicalFeedback,
  DynamicFeedbackParams,
} from '../utils/feedbackPromptBuilder';

export interface CordialFeedbackResult {
  message: string;
  actionPoints: string[];
  isAiGenerated: boolean;
}

/**
 * Heurística pedagógica de contingência (CNV) caso a API externa esteja indisponível,
 * estruturada nos 3 Pilares Pedagógicos Reflexivos e Markdown nativo do WhatsApp (*).
 */
function buildFallbackCordialMessage(
  userName: string,
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[]
): { message: string; actionPoints: string[] } {
  return buildDynamicPedagogicalFeedback({
    userName,
    normTitle,
    rawContext,
    normSection,
    normDetails,
  });
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
          isAiGenerated: data.isAiGenerated !== false && !data.isFallback,
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

export interface IdentifyNormResult {
  normId: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  isAiIdentified: boolean;
}

/**
 * Heurística de correspondência textual para fallback caso o servidor/IA esteja indisponível
 */
function heuristicMatchNorm(rawContext: string, norms: any[]): IdentifyNormResult {
  if (!rawContext || !Array.isArray(norms) || norms.length === 0) {
    return {
      normId: norms[0]?.id || '',
      reason: 'Norma padrão do Manual',
      confidence: 'low',
      isAiIdentified: false,
    };
  }

  const text = rawContext.toLowerCase();
  let bestScore = -1;
  let bestNorm = norms[0];
  let matchReason = 'Correspondência por similaridade de contexto';

  // Dicionário de sinônimos/temas chave
  const keywordsMap: Record<string, string[]> = {
    celular: ['celular', 'telefone', 'zap', 'whatsapp', 'rede social', 'foto', 'filmagem', 'ligação'],
    vestuario: ['uniforme', 'roupa', 'vestimenta', 'camisa', 'avental', 'calçado', 'tênis', 'chinelo', 'maiô', 'sunga'],
    transporte: ['van', 'ônibus', 'transporte', 'rampa', 'portão', 'portaria', 'calçada', 'embarque', 'desembarque', 'fila'],
    academia: ['academia', 'natação', 'piscina', 'judô', 'balé', 'deslocamento', 'vestiário'],
    alimentacao: ['almoço', 'jantar', 'lanche', 'refeição', 'refeitório', 'comida', 'prato', 'talher', 'engasgo'],
    sensivel: ['choro', 'mordida', 'birra', 'grito', 'conflito', 'briga', 'acolhimento', 'sono', 'fralda', 'machucou'],
    parque: ['parque', 'parcão', 'brinquedo', 'escorregador', 'queda', 'segurança', 'balanço'],
    culinaria: ['culinária', 'fogo', 'faca', 'cozinha', 'receita'],
    licao: ['lição', 'dever', 'tarefa', 'caderno', 'estudo', 'reforço'],
    pontualidade: ['horário', 'atraso', 'saída antecipada', 'ponto', 'falta', 'revezamento'],
  };

  norms.forEach((norm) => {
    let score = 0;
    const titleNorm = (norm.title || '').toLowerCase();
    const summaryNorm = (norm.summary || '').toLowerCase();
    const detailsNorm = (Array.isArray(norm.details) ? norm.details.join(' ') : '').toLowerCase();
    const tagsNorm = (Array.isArray(norm.tags) ? norm.tags.join(' ') : '').toLowerCase();
    const sectionNorm = (norm.sectionNumber || '').toLowerCase();

    // Verificação de número de seção explícito no texto (ex: "seção 4", "item 5")
    if (sectionNorm && (text.includes(`seção ${sectionNorm}`) || text.includes(`secao ${sectionNorm}`) || text.includes(`item ${sectionNorm}`))) {
      score += 50;
      matchReason = `Identificada menção direta à Seção ${norm.sectionNumber}`;
    }

    // Busca de palavras do texto no título e tags da norma
    const words = text.split(/[\s,.;:!?()]+/).filter((w) => w.length > 3);
    words.forEach((w) => {
      if (titleNorm.includes(w)) score += 8;
      if (tagsNorm.includes(w)) score += 6;
      if (summaryNorm.includes(w)) score += 3;
      if (detailsNorm.includes(w)) score += 1;
    });

    // Correspondência por clusters temáticos
    Object.entries(keywordsMap).forEach(([theme, terms]) => {
      const textMatchesTheme = terms.some((term) => text.includes(term));
      const normMatchesTheme = terms.some((term) => titleNorm.includes(term) || tagsNorm.includes(term) || summaryNorm.includes(term));
      if (textMatchesTheme && normMatchesTheme) {
        score += 15;
        matchReason = `Alinhamento com o tema "${theme}" (${norm.title})`;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestNorm = norm;
    }
  });

  return {
    normId: bestNorm?.id || norms[0]?.id || '',
    reason: matchReason,
    confidence: bestScore >= 20 ? 'high' : bestScore >= 8 ? 'medium' : 'low',
    isAiIdentified: false,
  };
}

/**
 * Identifica a norma correspondente no texto com IA (Gemini) ou Heurística Semântica
 */
export async function identifyNormFromContext(
  rawContext: string,
  norms: any[]
): Promise<IdentifyNormResult> {
  const cleanContext = (rawContext || '').trim();
  if (!cleanContext || !Array.isArray(norms) || norms.length === 0) {
    return {
      normId: norms?.[0]?.id || '',
      reason: 'Sem contexto suficiente',
      confidence: 'low',
      isAiIdentified: false,
    };
  }

  try {
    const response = await fetch('/api/gemini/identify-norm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawContext: cleanContext,
        norms: norms.map((n) => ({
          id: n.id,
          sectionNumber: n.sectionNumber,
          title: n.title,
          moduleTitle: n.moduleTitle,
          type: n.type,
          tags: n.tags,
          summary: n.summary,
        })),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.normId) {
        // Valida se o ID existe na lista
        const exists = norms.some((n) => n.id === data.normId);
        if (exists) {
          return {
            normId: data.normId,
            reason: data.reason || 'Identificado por correspondência semântica de IA',
            confidence: data.confidence || 'high',
            isAiIdentified: data.isAiIdentified !== false && !data.isFallback,
          };
        }
      }
    }
  } catch (error) {
    console.warn('[feedbackAiService] Erro ao chamar /api/gemini/identify-norm, usando heurística:', error);
  }

  return heuristicMatchNorm(cleanContext, norms);
}
