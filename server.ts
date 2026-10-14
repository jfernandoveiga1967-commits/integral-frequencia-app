import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { getSalutationForName } from './src/utils/genderUtils';
import {
  buildDynamicPedagogicalFeedback,
  buildGeminiFeedbackSystemPrompt,
  sanitizeCordialMessageForWhatsApp,
} from './src/utils/feedbackPromptBuilder';
import {
  detectSegmentoFromTurma,
  getSegmentoConfig,
  buildFallback4PilaresProposal,
  format4PilaresDevelopment,
  Semanario4Pilares,
} from './src/services/semanarioAiService';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '20mb' }));

// Static files serving directly by Express
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/src/assets', express.static(path.join(process.cwd(), 'src/assets')));
app.use('/assets/images', express.static(path.join(process.cwd(), 'src/assets/images')));
app.use(
  '/node_modules/pdfjs-dist/build',
  express.static(path.join(process.cwd(), 'node_modules/pdfjs-dist/build'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    },
  })
);

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return aiClient;
}

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API Route: Gerador de Propostas Pedagógicas com Gemini (Equipe Pedagógica e Coordenadores)
app.post('/api/gemini/generate-proposal', async (req, res) => {
  try {
    const userRole = (
      (req.headers['x-user-role'] as string) ||
      req.body?.user?.role ||
      req.body?.userRole ||
      ''
    ).toLowerCase();

    // Validação de perfil: Permite Coordenadores, Professores, Monitores(as), Auxiliares, ADIs e Educadores cadastrados
    const allowedRoles = [
      'coordenador',
      'professor',
      'auxiliar',
      'nutricionista',
      'admin',
      'monitora',
      'monitor',
      'adi',
      'educador',
      'colaborador',
    ];
    if (userRole && !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Acesso negado: A geração de propostas pedagógicas com inteligência artificial é restrita à equipe pedagógica cadastrada.',
        forbidden: true,
      });
    }

    const { turma, category, theme, dayOfWeek, date, staffList } = req.body;

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chave GEMINI_API_KEY não configurada no ambiente.',
        useFallback: true,
      });
    }

    // Identificação de categoria e segmento escolar da turma
    const normalizedCat = (category || 'Atividade Geral').trim();
    const segmento = detectSegmentoFromTurma(turma);
    const segConfig = getSegmentoConfig(segmento);

    const isDevocional = normalizedCat.toLowerCase().includes('devocional');
    const isContacao =
      normalizedCat.toLowerCase().includes('história') ||
      normalizedCat.toLowerCase().includes('historia') ||
      normalizedCat.toLowerCase().includes('livro') ||
      normalizedCat.toLowerCase().includes('leitura') ||
      normalizedCat.toLowerCase().includes('literatura');

    // Fonte prioritária e mandatória: Quadro de Atribuições vinculado à turma selecionada
    const exactAdi =
      staffList?.turmaAtribuicao?.adi?.trim() ||
      (Array.isArray(staffList?.adis) && staffList.adis.length === 1 ? staffList.adis[0].trim() : '');
    const exactMonitor =
      staffList?.turmaAtribuicao?.monitora?.trim()
        ? (staffList.turmaAtribuicao.assistente?.trim()
            ? `${staffList.turmaAtribuicao.monitora.trim()} e ${staffList.turmaAtribuicao.assistente.trim()}`
            : staffList.turmaAtribuicao.monitora.trim())
        : (Array.isArray(staffList?.monitors) && staffList.monitors.length > 0 ? staffList.monitors.join(', ') : '');

    const adisText = exactAdi || (Array.isArray(staffList?.adis) && staffList.adis.length > 0
      ? staffList.adis.join(', ')
      : 'Patrícia');
    const monitorsText = exactMonitor || (Array.isArray(staffList?.monitors) && staffList.monitors.length > 0
      ? staffList.monitors.join(', ')
      : 'Márcia');

    const cleanTheme = theme && String(theme).trim() ? String(theme).trim() : '';

    const prompt = `Você é um Arquiteto Pedagógico e Coordenador experiente na Escola Crescer.
Sua missão é elaborar a proposta pedagógica para o Semanário do Programa Integral estruturada OBRIGATORIAMENTE nos 4 PILARES DIDÁTICOS, com linguagem e tempo adaptados ao segmento escolar da turma.

DADOS DA TURMA E SEGMENTAÇÃO:
- Turma: ${turma || 'Ensino Fundamental'}
- Segmento Escolar: ${segConfig.nomeSegmento} (Faixa Etária: ${segConfig.faixaEtaria})
- Tempo Estimado Obrigatório para o Segmento: ${segConfig.tempoEstimadoLabel} (${segConfig.tempoEstimadoMinutos} minutos)
- Diretriz de Linguagem do Segmento: ${segConfig.diretrizLinguagem}
- Categoria Pedagógica: ${normalizedCat}
- Tema da Semana: ${cleanTheme ? `"${cleanTheme}" (a proposta deve se inspirar e articular harmoniosamente a este tema)` : 'Nenhum tema inserido (proponha um tema pedagógico relevante, acolhedor e lúdico)'}
- Dia da semana e data: ${dayOfWeek || ''} ${date ? `(${date})` : ''}

EQUIPE OFICIAL ATRIBUÍDA:
- ADI(s): ${adisText}
- Monitora(s): ${monitorsText}

ESTRUTURAÇÃO OBRIGATÓRIA NOS 4 PILARES DIDÁTICOS:
1. Pilar 1 (Intencionalidade & BNCC):
   - Defina o objetivo pedagógico formativo da atividade (iniciando em letra minúscula).
   - Defina o foco de desenvolvimento: "motor", "cognitivo", "social" ou "socioemocional".
   - Liste os materiais simples e acessíveis da rotina escolar.
   - Tempo estimado: ${segConfig.tempoEstimadoLabel}.
2. Pilar 2 (Disparador Lúdico):
   - Crie uma introdução envolvente e disparadora:
     * Para Mini/Maternal e Infantil: música com gestos, história curta com fantoche ou elemento surpresa.
     * Para Fundamental I: pergunta disparadora instigante ou enigma cooperativo.
     * Para 6º Ano (REGRA ESTRITA ANTI-INFANTILIZAÇÃO): pergunta provocadora reflexiva, estudo de caso ou desafio contemporâneo.
3. Pilar 3 (Desenvolvimento Mão na Massa):
   - Detalhe o passo a passo da mediação prática do monitor e da ADI com os alunos (3 etapas claras e objetivas).
4. Pilar 4 (Sintetização & Transição):
   - Fechamento: partilha, reflexão ou apreciação coletiva.
   - Organização do Espaço: como as crianças e a equipe guardam os materiais e cuidam da sala.
   - Transição: encaminhamento sereno e acolhedor para a próxima rotina escolar.

REGRAS DE ESTILO E FORMATAÇÃO (ESTRITAMENTE OBRIGATÓRIAS):
- Sem Markdown Pesado: Proibido o uso de **, *, # ou formatações pesadas.
- Sem BNCC/Jargões: Proibido incluir códigos burocráticos (ex: EI02CG01, EF15EF01).
- Regra do Título: Frase normal com apenas a primeira letra maiúscula (e nomes próprios/sagrados). NUNCA em CAIXA ALTA. NUNCA repetir o nome do tema da semana nem o da categoria no título.
${isContacao ? '- Livro: Informar obrigatoriamente Livro, Autor e Editora reais existentes (formato: "Título do Livro, de Autor (Editora).").\n' : ''}${isDevocional ? '- Versículo: Citar versículo bíblico curto e real com livro, capítulo e versículo existentes.\n' : ''}
Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "title": "Nome da atividade em frase normal",
  "theme": "${cleanTheme || 'Tema pedagógico acolhedor'}",
  "suggestedAdi": "${adisText}",
  "suggestedMonitor": "${monitorsText}",
  "category": "${normalizedCat}",
  "segmento": "${segmento}",
  "tempoEstimadoMinutos": ${segConfig.tempoEstimadoMinutos},
  ${isContacao ? '"livro": "Título do Livro, de Autor (Editora).",\n  ' : ''}${isDevocional ? '"versiculo": "Citação bíblica curta e real",\n  ' : ''}"pilar1": {
    "objetivo": "texto em minúscula...",
    "focoDesenvolvimento": "motor | cognitivo | social | socioemocional",
    "materiais": ["item 1", "item 2"]
  },
  "pilar2": {
    "tipo": "musica | historia | pergunta | desafio",
    "descricao": "introdução disparadora envolvente..."
  },
  "pilar3": {
    "passoAPasso": ["etapa 1", "etapa 2", "etapa 3"],
    "mediacaoMonitor": "mediação da equipe..."
  },
  "pilar4": {
    "fechamento": "finalização com os alunos...",
    "organizacaoEspaco": "organização dos materiais...",
    "transicao": "transição para a próxima rotina..."
  },
  "materials": "• Item 1\\n• Item 2",
  "proposta": "resumo do objetivo em minúscula...",
  "atividades": "resumo do passo a passo...",
  "importante": "orientação acolhedora para a equipe..."
}`;

    let response: any = null;
    let attempts = 0;
    while (attempts < 2) {
      try {
        attempts++;
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2500,
          },
        });
        break;
      } catch (err: any) {
        if (attempts >= 2) {
          console.log('[Semanário IA] Ativando contingência dos 4 Pilares Didáticos (IA/créditos indisponíveis):', err?.status || 'indisponível');
          response = null;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    const responseText = response?.text || '';
    let parsed: any = null;
    if (responseText) {
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = null;
        }
      }
    }

    // Se a IA não respondeu ou houve falha, utiliza o gerador curado oficial dos 4 Pilares Didáticos
    if (!parsed || !parsed.title) {
      const fallbackProposal = buildFallback4PilaresProposal(turma, normalizedCat, cleanTheme);
      parsed = {
        ...fallbackProposal,
        suggestedAdi: exactAdi || (staffList?.adis?.[0] || 'Patrícia'),
        suggestedMonitor: exactMonitor || (staffList?.monitors?.length ? staffList.monitors.join(' e ') : 'Márcia'),
      };
    }

    // Normaliza campos para string limpa
    const toStringField = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) {
        return val.map((item) => (typeof item === 'string' ? `• ${item}` : JSON.stringify(item))).join('\n');
      }
      if (typeof val === 'object') {
        return Object.entries(val)
          .map(([k, v]) => `${k}:\n${Array.isArray(v) ? v.map((x) => `  • ${x}`).join('\n') : v}`)
          .join('\n\n');
      }
      return String(val);
    };

    // Remove markdown pesado (**, *, #, `), jargões burocráticos e códigos da BNCC
    const cleanPedagogicalText = (val: any): string => {
      let str = toStringField(val);
      if (!str) return '';
      return str
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/^#+\s*/gm, '')
        .replace(/`{1,3}/g, '')
        .replace(/\(?\s*BNCC\s*:?[^)]*\)?/gi, '')
        .replace(/\b(EI|EF)\d{2}[A-Z]{2}\d{2}\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    // Formata o título em frase normal (sentence case), sem caixa alta, sem repetir tema ou categoria
    const formatCleanTitle = (rawTitle: string): string => {
      let title = cleanPedagogicalText(rawTitle)
        .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
        .replace(/[.:;!]+$/, '')
        .trim();

      if (!title) {
        title = 'Vivência lúdica integrada';
      }

      title = title.toLowerCase();
      title = title.charAt(0).toUpperCase() + title.slice(1);

      title = title
        .replace(/\bdeus\b/gi, 'Deus')
        .replace(/\bjesus\b/gi, 'Jesus')
        .replace(/\bbíblia\b/gi, 'Bíblia')
        .replace(/\bsenhor\b/gi, 'Senhor');

      if (cleanTheme) {
        const themeWords = cleanTheme.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        for (const tw of themeWords) {
          const reg = new RegExp(`\\b${tw}\\b`, 'gi');
          if (reg.test(title)) {
            title = title.replace(reg, 'descobertas');
          }
        }
      }

      if (normalizedCat) {
        const catWords = normalizedCat.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        for (const cw of catWords) {
          const reg = new RegExp(`\\b${cw}\\b`, 'gi');
          if (reg.test(title)) {
            title = title.replace(reg, 'vivência');
          }
        }
      }

      title = title.replace(/\s{2,}/g, ' ').trim();
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      return title || 'Vivência lúdica integrada';
    };

    const ensureDiscretionaryLowerCase = (str: string): string => {
      if (!str) return '';
      let trimmed = str.trim();
      const firstWord = trimmed.split(/\s+/)[0] || '';
      if (!['Deus', 'Jesus', 'Cristo', 'Bíblia', 'Senhor'].includes(firstWord)) {
        trimmed = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
      }
      return trimmed;
    };

    const finalTitle = formatCleanTitle(parsed?.title || '');
    const livroStr = cleanPedagogicalText(parsed?.livro || '');
    const versiculoStr = cleanPedagogicalText(parsed?.versiculo || '');
    const importanteStr = cleanPedagogicalText(parsed?.importante || parsed?.dicaMonitora || '');

    // Extrai e valida a estrutura dos 4 Pilares Didáticos
    const p1Obj = ensureDiscretionaryLowerCase(
      cleanPedagogicalText(parsed?.pilar1?.objetivo || parsed?.proposta || parsed?.objectives || 'proporcionar vivência acolhedora e integrada')
    );
    const p1FocoRaw = String(parsed?.pilar1?.focoDesenvolvimento || 'cognitivo').toLowerCase();
    const p1Foco = ['motor', 'cognitivo', 'social', 'socioemocional'].includes(p1FocoRaw)
      ? (p1FocoRaw as 'motor' | 'cognitivo' | 'social' | 'socioemocional')
      : 'cognitivo';

    let p1Materiais: string[] = [];
    if (Array.isArray(parsed?.pilar1?.materiais)) {
      p1Materiais = parsed.pilar1.materiais.map((m: any) => cleanPedagogicalText(m)).filter(Boolean);
    } else if (parsed?.materials) {
      p1Materiais = String(parsed.materials)
        .split('\n')
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);
    }
    if (p1Materiais.length === 0) {
      p1Materiais = ['Materiais pedagógicos simples da rotina escolar'];
    }

    const p2Tipo = parsed?.pilar2?.tipo || (segmento === 'mini_maternal' ? 'musica' : 'pergunta');
    const p2Desc = cleanPedagogicalText(
      parsed?.pilar2?.descricao ||
      (segmento === 'mini_maternal'
        ? 'cantar uma melodia suave com palmas para acolher a turma em semicírculo.'
        : 'apresentar uma pergunta disparadora curiosa para conectar a turma ao tema.')
    );

    let p3Passos: string[] = [];
    if (Array.isArray(parsed?.pilar3?.passoAPasso) && parsed.pilar3.passoAPasso.length > 0) {
      p3Passos = parsed.pilar3.passoAPasso.map((p: any) => cleanPedagogicalText(p)).filter(Boolean);
    } else if (parsed?.atividades || parsed?.dinamica) {
      p3Passos = [cleanPedagogicalText(parsed.atividades || parsed.dinamica)];
    } else {
      p3Passos = [
        'Acomodar as crianças com acolhimento e apresentar os recursos pedagógicos.',
        'Orientar a atividade prática de forma cooperativa e incentivando a autonomia.',
        'Acompanhar os alunos com mediação afetuosa e escuta atenta.',
      ];
    }

    const p3Mediacao = cleanPedagogicalText(
      parsed?.pilar3?.mediacaoMonitor ||
      'A monitora e a ADI conduzem a turma com presença atenta e incentivo constante aos avanços do grupo.'
    );

    const p4Fechamento = cleanPedagogicalText(
      parsed?.pilar4?.fechamento || 'roda de conversa breve para partilha e apreciação coletiva.'
    );
    const p4Organizacao = cleanPedagogicalText(
      parsed?.pilar4?.organizacaoEspaco || 'organização colaborativa dos materiais na sala.'
    );
    const p4Transicao = cleanPedagogicalText(
      parsed?.pilar4?.transicao || 'transição serena e acolhedora para a próxima rotina escolar.'
    );

    const pilares: Semanario4Pilares = {
      pilar1_intencionalidade: {
        objetivo: p1Obj,
        focoDesenvolvimento: p1Foco,
        materiais: p1Materiais,
        tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
      },
      pilar2_disparadorLudico: {
        tipo: p2Tipo,
        descricao: p2Desc,
      },
      pilar3_maoNaMassa: {
        passoAPasso: p3Passos,
        mediacaoMonitor: p3Mediacao,
      },
      pilar4_sintetizacaoTransicao: {
        fechamento: p4Fechamento,
        organizacaoEspaco: p4Organizacao,
        transicao: p4Transicao,
      },
      segmento,
      tempoEstimadoMinutos: segConfig.tempoEstimadoMinutos,
    };

    const finalFormattedDev = format4PilaresDevelopment(normalizedCat, finalTitle, pilares, {
      livro: livroStr || undefined,
      versiculo: versiculoStr || undefined,
      dicaMonitora: importanteStr || undefined,
    });

    const finalMaterialsList = p1Materiais.map((m) => `• ${m}`).join('\n');
    const finalObjectives = `${p1Obj} [Foco: ${p1Foco.toUpperCase()} • ${segConfig.tempoEstimadoLabel}]`;

    // Fonte prioritária e mandatória: Quadro de Atribuições vinculado à turma
    const finalAdi = exactAdi || (typeof parsed?.suggestedAdi === 'string' && parsed.suggestedAdi.trim() ? cleanPedagogicalText(parsed.suggestedAdi) : (staffList?.adis?.[0] || 'Patrícia'));
    const finalMonitor = exactMonitor || (typeof parsed?.suggestedMonitor === 'string' && parsed.suggestedMonitor.trim() ? cleanPedagogicalText(parsed.suggestedMonitor) : (staffList?.monitors?.length ? staffList.monitors.join(' e ') : 'Márcia'));

    const normalizedProposal = {
      title: finalTitle,
      theme: typeof parsed?.theme === 'string' && parsed.theme.trim() ? cleanPedagogicalText(parsed.theme) : (cleanTheme || 'Vivência pedagógica integrada'),
      suggestedAdi: finalAdi,
      suggestedMonitor: finalMonitor,
      category: normalizedCat,
      segmento,
      livro: livroStr || undefined,
      versiculo: versiculoStr || undefined,
      objectives: finalObjectives,
      development: finalFormattedDev,
      formattedDevelopment: finalFormattedDev,
      materials: finalMaterialsList,
      proposta: p1Obj,
      atividades: p3Passos.join(' '),
      dinamica: `${p2Desc} ${p3Mediacao}`,
      dicaMonitora: importanteStr || undefined,
      pilares,
    };

    return res.json({
      success: true,
      proposal: normalizedProposal,
    });
  } catch (error: any) {
    console.warn('Erro ao chamar Gemini API para Semanário:', error?.message || error);
    return res.status(500).json({
      error: error?.message || 'Falha ao gerar proposta com IA',
      useFallback: true,
    });
  }
});

// Helper: Gerador pedagógico oficial de contingência baseado nos 3 Pilares e CNV
function buildServerFallbackCordialFeedback(
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

// Helper: Heurística Semântica Contextual no servidor para correspondência de normas no catálogo
function serverHeuristicMatchNorm(rawContext: string, condensedNorms: any[]): { normId: string; reason: string; confidence: 'high' | 'medium' | 'low' } {
  if (!rawContext || !Array.isArray(condensedNorms) || condensedNorms.length === 0) {
    return {
      normId: condensedNorms?.[0]?.id || '',
      reason: 'Norma institucional padrão do Manual',
      confidence: 'low',
    };
  }

  const text = rawContext.toLowerCase();
  let bestScore = -1;
  let bestNorm = condensedNorms[0];
  let matchReason = 'Correspondência semântica e contextual com as normas do Manual';

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

  condensedNorms.forEach((norm) => {
    let score = 0;
    const titleNorm = (norm.title || '').toLowerCase();
    const summaryNorm = (norm.summary || '').toLowerCase();
    const tagsNorm = (Array.isArray(norm.tags) ? norm.tags.join(' ') : '').toLowerCase();
    const sectionNorm = (norm.section || '').toLowerCase();

    if (sectionNorm && (text.includes(`seção ${sectionNorm}`) || text.includes(`secao ${sectionNorm}`) || text.includes(`item ${sectionNorm}`))) {
      score += 50;
      matchReason = `Identificada menção direta à Seção ${norm.section}`;
    }

    const words = text.split(/[\s,.;:!?()]+/).filter((w: string) => w.length > 3);
    words.forEach((w: string) => {
      if (titleNorm.includes(w)) score += 8;
      if (tagsNorm.includes(w)) score += 6;
      if (summaryNorm.includes(w)) score += 3;
    });

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
    normId: bestNorm?.id || condensedNorms[0]?.id || '',
    reason: matchReason,
    confidence: bestScore >= 20 ? 'high' : bestScore >= 8 ? 'medium' : 'low',
  };
}

// API Route: Gerador de Feedback Cordial por Norma com IA e CNV (Coordenação Pedagógica)
app.post('/api/gemini/generate-cordial-feedback', async (req, res) => {
  try {
    const { userName, normTitle, normSection, rawContext, normDetails } = req.body;
    if (!userName || !normTitle || !rawContext) {
      return res.status(400).json({
        error: 'Campos obrigatórios ausentes (userName, normTitle, rawContext).',
      });
    }

    const { salutation, firstName } = getSalutationForName(userName);
    const sectionLabel = normSection ? ` (Seção ${normSection})` : '';
    const normFullRef = `"${normTitle}"${sectionLabel}`;

    const fallback = buildServerFallbackCordialFeedback(
      userName,
      normTitle,
      rawContext,
      normSection,
      normDetails
    );

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = buildGeminiFeedbackSystemPrompt({
          userName,
          normTitle,
          rawContext,
          normSection,
          normDetails,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2500,
            temperature: 0.7,
          },
        });

        const responseText = response?.text || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }

        if (parsed?.message) {
          const messageText = sanitizeCordialMessageForWhatsApp(parsed.message, {
            userName,
            normTitle,
            rawContext,
            normSection,
          });

          return res.json({
            success: true,
            feedback: {
              message: messageText,
              actionPoints: Array.isArray(parsed?.actionPoints) && parsed.actionPoints.length > 0
                ? parsed.actionPoints
                : fallback.actionPoints,
            },
            isAiGenerated: true,
          });
        }
      } catch (geminiError: any) {
        // Se a cota/crédito foi esgotado (402/429) ou serviço indisponível, ativamos o motor CNV sem erro 500
        console.log('[Feedback CNV] Ativando motor pedagógico CNV integrado (contingência de IA/créditos):', geminiError?.status || 'indisponível');
      }
    }

    // Retorna fallback pedagógico oficial de CNV com HTTP 200
    return res.json({
      success: true,
      feedback: fallback,
      isFallback: true,
      isAiGenerated: false,
      notice: 'Mensagem elaborada via Diretrizes Institucionais e Metodologia CNV.',
    });
  } catch (error: any) {
    const fallback = buildServerFallbackCordialFeedback(
      req.body?.userName || 'Colaboradora',
      req.body?.normTitle || 'Norma Institucional',
      req.body?.rawContext || '',
      req.body?.normSection,
      req.body?.normDetails
    );
    return res.json({
      success: true,
      feedback: fallback,
      isFallback: true,
      isAiGenerated: false,
    });
  }
});

// API Route: Identificação Inteligente da Norma no Texto do Fato (AI Auto-Match)
app.post('/api/gemini/identify-norm', async (req, res) => {
  try {
    const { rawContext, norms } = req.body;
    if (!rawContext) {
      return res.status(400).json({ error: 'Parâmetro rawContext ausente.' });
    }

    const normsList = Array.isArray(norms) ? norms : [];
    const condensedNorms = normsList.map((n: any) => ({
      id: n.id,
      section: n.sectionNumber || '',
      title: n.title,
      module: n.moduleTitle || n.moduleId || '',
      type: n.type || '',
      tags: Array.isArray(n.tags) ? n.tags.slice(0, 5) : [],
      summary: (n.summary || '').slice(0, 140),
    }));

    const heuristicMatch = serverHeuristicMatchNorm(rawContext, condensedNorms);

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = `Você é o coordenador pedagógico e especialista em conformidade institucional do Colégio Crescer.
Sua tarefa é analisar o relato de um fato ocorrido na rotina escolar e identificar com precisão qual norma institucional do Manual de Orientações se aplica diretamente à situação.

Relato do Fato Ocorrido:
"${rawContext}"

Catálogo de Normas Disponíveis no Manual:
${JSON.stringify(condensedNorms, null, 2)}

Critérios de Seleção:
1. Identifique a norma mais relevante e específica para o fato (ex: se fala de celular/redes sociais, selecione a norma de celular; se fala de transporte/academia/rampa/portaria, selecione a norma correspondente; se fala de vestuário/uniforme, selecione vestuário; se fala de mordida/choro/mediação sensível, selecione a norma correspondente).
2. Se nenhuma for 100% exata, selecione a mais próxima pelo princípio do cuidado e segurança das crianças.

Responda estritamente em formato JSON:
{
  "normId": "id_da_norma_selecionada",
  "reason": "Explicação concisa (1 linha) de por que esta norma foi selecionada",
  "confidence": "high" | "medium" | "low"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 600,
            temperature: 0.2,
          },
        });

        const responseText = response?.text || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }

        if (parsed?.normId) {
          const exists = condensedNorms.some((n: any) => n.id === parsed.normId);
          if (exists) {
            return res.json({
              success: true,
              normId: parsed.normId,
              reason: parsed?.reason || 'Identificado por inteligência contextual',
              confidence: parsed?.confidence || 'high',
              isAiIdentified: true,
            });
          }
        }
      } catch (geminiError: any) {
        console.log('[Identify Norm] Ativando heurística semântica integrada (contingência de IA/créditos):', geminiError?.status || 'indisponível');
      }
    }

    return res.json({
      success: true,
      normId: heuristicMatch.normId,
      reason: heuristicMatch.reason,
      confidence: heuristicMatch.confidence,
      isFallback: true,
      isAiIdentified: false,
    });
  } catch (error: any) {
    return res.json({
      success: true,
      normId: '',
      reason: 'Norma institucional',
      confidence: 'low',
      isFallback: true,
    });
  }
});

// API Route: Agente de Voz Sofia — Guia do Integral com Function Calling (Exclusivo Administrador)
app.post('/api/gemini/voice-agent', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Comando de voz não fornecido.' });
    }

    // Validação de Segurança e Permissão: Acesso restrito exclusivo ao Administrador
    const userRole = String(context?.userRole || '').trim().toLowerCase();
    const userEmail = String(context?.userEmail || '').trim().toLowerCase();
    const userCargo = String(context?.userCargoLabel || '').trim().toLowerCase();
    const userId = String(context?.userId || '').trim().toLowerCase();

    const isAuthorizedAdmin =
      context?.isAdmin === true ||
      userRole === 'coordenador' ||
      userRole === 'admin' ||
      userRole === 'administrador' ||
      userRole.includes('admin') ||
      userRole.includes('coord') ||
      userCargo.includes('administrador') ||
      userCargo.includes('coordenador') ||
      userEmail === 'fernando.veiga@crescercampinas.com.br' ||
      userEmail === 'jfernandoveiga1967@gmail.com' ||
      userEmail === 'coordenacao@crescer.edu.br' ||
      userId === 'usr_coord_1';

    if (!isAuthorizedAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. A assistente de voz Sofia é de uso exclusivo de usuários com perfil de Administrador.',
        code: 'FORBIDDEN_ADMIN_ONLY',
      });
    }

    const ai = getAIClient();
    if (ai) {
      try {
        const systemInstruction = `Você é Sofia, a assistente e guia inteligente por voz do Período Integral do Colégio Crescer.
Seu tom é acolhedor, profissional, pedagógico e objetivo.
Sua resposta será falada em voz alta através de Text-To-Speech (TTS), portanto:
- Seja concisa, clara e natural (1 a 3 frases no máximo).
- Evite listar caracteres especiais, asteriscos ou tabelas.
- Identifique com precisão se a intenção do usuário requer o uso de uma das 3 funções disponíveis:
  1. consultar_ou_lancar_chamada: para verificar pendências, marcar presença ou falta de alunos.
  2. consultar_manual_normas: para responder sobre regras, fardamento, segurança, postura e procedimentos do Manual Oficial de 51 Normas do Período Integral (Seções 1 a 51 organizadas em 4 Módulos: Módulo 1 Rotina Operacional 1-16, Módulo 2 Segurança 17-27, Módulo 3 Postura e Fardamento 28-38, Módulo 4 Guia Socioemocional 39-51).
  3. consultar_cardapio_ou_semanario: para consultar almoço, lanche, oficinas ou rotinas do Semanário.
Retorne um JSON estrito no seguinte formato:
{
  "spokenText": "texto que será falado para o usuário",
  "functionCall": {
    "name": "consultar_ou_lancar_chamada" | "consultar_manual_normas" | "consultar_cardapio_ou_semanario",
    "args": { ... }
  }
}
Se nenhuma função for estritamente necessária, omita "functionCall" e apenas responda com "spokenText".`;

        // Manipulador de Timeout resiliente ajustado para 20 segundos
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 20000);
        });

        // Montagem do payload multi-modal (suporte a áudio otimizado e texto)
        const contentsPayload: any[] = [];
        if (req.body.audioBase64) {
          contentsPayload.push({
            inlineData: {
              mimeType: req.body.mimeType || 'audio/webm',
              data: req.body.audioBase64,
            },
          });
        }
        contentsPayload.push(`Comando do usuário: "${prompt}". Contexto atual: Data: ${context?.selectedDate || 'hoje'}, Turma: ${context?.selectedTurma || 'todas'}, Usuário: ${context?.userName || 'colaborador'}.`);

        const geminiCall = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: contentsPayload,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        const response: any = await Promise.race([geminiCall, timeoutPromise]);

        const responseText = response.text || '';
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleaned);
        }

        if (parsed?.spokenText) {
          return res.json({
            success: true,
            spokenText: parsed.spokenText,
            functionCall: parsed.functionCall,
            isAiGenerated: true,
          });
        }
      } catch (geminiError: any) {
        const errorMsg = geminiError?.message || String(geminiError || '');
        const isRateLimit =
          geminiError?.status === 429 ||
          errorMsg.includes('429') ||
          errorMsg.includes('RESOURCE_EXHAUSTED') ||
          errorMsg.includes('Resource has been exhausted') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('Quota exceeded');

        const isTimeout = errorMsg.includes('TIMEOUT_EXCEEDED');

        console.warn(`[Sofia Voice Agent] ${isRateLimit ? 'Rate Limit (429)' : isTimeout ? 'Timeout (20s)' : 'Erro'} no Gemini:`, errorMsg);

        // Tratamento específico de erro HTTP 429 (Resource Exhausted / Rate Limit)
        if (isRateLimit) {
          return res.status(429).json({
            success: false,
            status: 'RATE_LIMIT_EXCEEDED',
            code: 'RATE_LIMIT_EXCEEDED',
            error: 'Limite de requisições do Gemini atingido (Rate limit/429). Aguarde alguns instantes.',
            spokenText: 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.',
            functionCall: null,
            isFallback: true,
            isQuotaOrTimeout: true,
          });
        }

        // Tratamento específico de Timeout (20s)
        if (isTimeout) {
          return res.status(504).json({
            success: false,
            status: 'TIMEOUT_EXCEEDED',
            code: 'TIMEOUT_EXCEEDED',
            error: 'Tempo limite de resposta de 20 segundos excedido.',
            spokenText: 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.',
            functionCall: null,
            isFallback: true,
            isQuotaOrTimeout: true,
          });
        }

        // Resposta vocal padrão resiliente para qualquer outro erro
        return res.json({
          success: true,
          status: 'FALLBACK',
          spokenText: 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.',
          functionCall: null,
          isFallback: true,
          isQuotaOrTimeout: true,
        });
      }
    }

    // Heurística local de contingência do servidor
    const lower = prompt.toLowerCase();
    let functionCall: any = null;
    let spokenText = 'Comando processado com sucesso.';

    if (lower.includes('presenca') || lower.includes('chamada') || lower.includes('falta') || lower.includes('pendencia')) {
      functionCall = {
        name: 'consultar_ou_lancar_chamada',
        args: {
          acao: lower.includes('presenca') ? 'lancar_presenca' : lower.includes('falta') ? 'lancar_falta' : 'consultar_pendencias',
        },
      };
      spokenText = 'Consultando informações da chamada de frequência.';
    } else if (lower.includes('norma') || lower.includes('manual') || lower.includes('regra') || lower.includes('celular') || lower.includes('radio') || lower.includes('alergia')) {
      functionCall = {
        name: 'consultar_manual_normas',
        args: { termoOuTema: prompt },
      };
      spokenText = 'Consultando as diretrizes oficiais no Manual de 50 Normas do Colégio Crescer.';
    } else if (lower.includes('cardapio') || lower.includes('almoco') || lower.includes('lanche') || lower.includes('semanario')) {
      functionCall = {
        name: 'consultar_cardapio_ou_semanario',
        args: { tipo: lower.includes('lanche') ? 'cardapio_lanche' : lower.includes('semanario') ? 'roteiro_semanario' : 'cardapio_almoco' },
      };
      spokenText = 'Consultando cardápio e rotinas pedagógicas do Programa Integral.';
    } else {
      spokenText = 'Olá! Sou Sofia, assistente por voz do Integral. Como posso te orientar hoje?';
    }

    return res.json({
      success: true,
      spokenText,
      functionCall,
      isFallback: true,
    });
  } catch (error: any) {
    return res.json({
      success: true,
      spokenText: 'Estou reestabelecendo minha conexão com o sistema do Crescer, tente novamente em alguns instantes.',
      isFallback: true,
    });
  }
});

// Vite Middleware setup for dev vs production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      optimizeDeps: { force: true },
    });
    app.use(vite.middlewares);

    // Dev fallback for SPA navigation and client routes
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
