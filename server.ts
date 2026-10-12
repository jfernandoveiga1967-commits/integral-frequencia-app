import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { getSalutationForName } from './src/utils/genderUtils';

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

    // Identificação de categoria e faixa etária da turma
    const normalizedCat = (category || 'Atividade Geral').trim();
    const isDevocional = normalizedCat.toLowerCase().includes('devocional');
    const isContacao =
      normalizedCat.toLowerCase().includes('história') ||
      normalizedCat.toLowerCase().includes('historia') ||
      normalizedCat.toLowerCase().includes('livro') ||
      normalizedCat.toLowerCase().includes('leitura') ||
      normalizedCat.toLowerCase().includes('literatura');
    const isArtes =
      normalizedCat.toLowerCase().includes('arte') ||
      normalizedCat.toLowerCase().includes('desenho') ||
      normalizedCat.toLowerCase().includes('pintura');
    const isUpperElementary = /4[º°o]|5[º°o]|6[º°o]/i.test(turma || '');

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

    const prompt = `Você é um coordenador pedagógico experiente na Escola Crescer.
Sua missão é elaborar a proposta pedagógica para o Semanário do Programa Integral seguindo OBRIGATORIAMENTE a Matriz Fixa de Padrão Pedagógico da instituição.

DADOS DA TURMA E ATIVIDADE:
- Turma / Faixa Etária: ${turma || 'Ensino Fundamental'}
- Categoria Pedagógica: ${normalizedCat}
- Tema da Semana: ${cleanTheme ? `"${cleanTheme}" (a proposta deve se inspirar e articular harmoniosamente a este tema)` : 'Nenhum tema inserido (proponha um tema pedagógico relevante, acolhedor e lúdico)'}
- Dia da semana e data: ${dayOfWeek || ''} ${date ? `(${date})` : ''}

QUADRO DE ATRIBUIÇÕES OFICIAL DA TURMA (${turma}):
- ADI(s) Oficial(is) Atribuída(s) a esta turma: ${adisText}
- Monitora(s) Oficial(is) Atribuída(s) a esta turma: ${monitorsText}

REGRAS DE OURO DE ESTILO E FORMATAÇÃO (ESTRITAMENTE OBRIGATÓRIAS):
1. Caixa Baixa (Texto Discricionário): Todo o corpo de texto (Proposta, Atividades, Importante) deve usar estritamente letras minúsculas (iniciando o parágrafo em minúscula, ex: "estimular a imaginação...", "acomodar os pequenos...", "respeitar o tempo..."), usando maiúscula apenas no início de novas frases internas, nomes próprios e nomes sagrados (Deus, Jesus).
2. Sem Markdown Pesado: Proibido o uso de **, *, # ou formatações pesadas. O texto deve sair plano e limpo para impressão e visualização em PDF.
3. Sem BNCC/Jargões: Proibido incluir códigos da BNCC (ex: EI02CG01, EF15EF01) ou termos técnicos burocráticos.
4. Livros e Versículos Reais: Na categoria 'Contação de História', informar obrigatoriamente Livro, Autor e Editora reais existentes (formato: "Título do Livro, de Autor (Editora)."). Em 'Devocional', citar versículo bíblico curto e real.
5. Regra do Título: Frase normal com apenas a primeira letra maiúscula (e nomes próprios/sagrados). NUNCA em CAIXA ALTA. NUNCA repetir o nome do tema da semana nem o nome da categoria no título.
6. Geração Estritamente Única: Gere apenas uma atividade e pare imediatamente após a seção 'Importante:'.

EXEMPLO MATRIZ DE REFERÊNCIA (MODELO OBRIGATÓRIO DE ESTILO E DIAGRAMAÇÃO):
Contação de História:
O abraço do monstrinho das cores

Proposta:
estimular a imaginação, a escuta atenta e o reconhecimento das emoções básicas através de fantoches simples e entonações de voz suaves.

Atividades:
acomodar os pequenos em almofadas no chão em semicírculo. apresentar os personagens da história com fantoches de feltro ou gravuras coloridas. contar a história com pausas dramáticas, usando expressões faciais e gestos corporais para ilustrar sentimentos como alegria, medo, calma e tristeza. ao final, convidar cada criança a dar um abraço afetuoso no fantoche da cor que ela mais gostou e imitar uma cara alegre junto com o monitor.

Livro:
O Monstro das Cores, de Anna Llenas (Editora Aletria).

Importante:
respeitar o tempo de atenção dos pequenos, mantendo a contação entre dez e quinze minutos. acolher no colo quem demonstrar dispersão ou sensibilidade emocional durante a narrativa.

ADAPTAÇÃO DA MATRIZ PARA A CATEGORIA "${normalizedCat}":
${
  isDevocional
    ? `Para categoria Devocional:
Devocional:
[Título da atividade em frase normal, sem repetir o tema]

Proposta:
[texto fluido iniciando em minúscula sobre reflexão, amor de Deus e convivência fraterna]

Atividades:
[condução prática da roda de conversa, partilha e oração simples e participativa em texto corrido e fluido]

Versículo:
[citação bíblica curta e real com livro, capítulo e versículo existente, ex: Lucas 6:31]

Importante:
[orientação acolhedora iniciando em minúscula sobre sensibilidade e respeito]`
    : isContacao
    ? `Para categoria Contação de História:
Contação de História:
[Título da atividade em frase normal, sem repetir o tema]

Proposta:
[texto fluido iniciando em minúscula sobre a imaginação e a narrativa]

Atividades:
[passo a passo detalhado e fluido de acolhimento e contação em texto corrido]

Livro:
[Título da Obra, de Autor (Editora) - obrigatório obra real existente no mercado brasileiro]

Importante:
[orientação acolhedora iniciando em minúscula]`
    : isArtes
    ? `Para categoria Artes:
Artes:
[Título da atividade em frase normal, sem repetir o tema]

Proposta:
[texto fluido iniciando em minúscula valorizando a sensibilidade artística]

Atividades:
[passo a passo fluido e prático da oficina artística com as crianças]

Materiais (se aplicável):
• [Item 1]
• [Item 2]

Importante:
[orientação acolhedora iniciando em minúscula]
${
  isUpperElementary
    ? '\nATENÇÃO ESPECIAL (REGRA ANTI-INFANTILIZAÇÃO PARA 4º AO 6º ANO): Como a turma é de 4º ao 6º ano (' +
      turma +
      '), proponha técnicas expressivas desafiadoras como mosaicos, mandalas geométricas, estudos de perspectiva básica, luz e sombra com grafite/carvão, esculturas em argila ou modelagem estruturada, pontilhismo ou gravura em relevo. É TERMINANTEMENTE PROIBIDO propor desenhos infantis de pintar, folhas prontas de colorir ou massinha de modelar simples.'
    : ''
}`
    : `Para a categoria ${normalizedCat}:
${normalizedCat}:
[Título da atividade em frase normal, sem repetir o tema nem a categoria]

Proposta:
[texto fluido iniciando em minúscula sobre a vivência prática, sem códigos BNCC]

Atividades:
[passo a passo fluido e prático em texto corrido de como a monitora conduz a turma e os recursos]

Materiais (se aplicável):
• [Item 1]
• [Item 2]

Importante:
[orientação acolhedora iniciando em minúscula sobre acolhimento e mediação com a ADI]`
}

EQUIPE OFICIAL DA TURMA:
- "suggestedAdi": "${adisText}"
- "suggestedMonitor": "${monitorsText}"

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem ** e sem #):
{
  "title": "Nome da atividade em frase normal",
  "theme": "${cleanTheme || 'Tema pedagógico acolhedor'}",
  "suggestedAdi": "${adisText}",
  "suggestedMonitor": "${monitorsText}",
  "category": "${normalizedCat}",
  ${isContacao ? '"livro": "Título do Livro, de Autor (Editora).",\n  ' : ''}${isDevocional ? '"versiculo": "Citação bíblica curta e real",\n  ' : ''}"proposta": "texto corrido em minúscula...",
  "atividades": "texto corrido em minúscula com o passo a passo prático...",
  "materials": "• Item 1\\n• Item 2",
  "importante": "texto corrido em minúscula sobre acolhimento...",
  "formattedDevelopment": "${isDevocional ? 'Devocional:' : isContacao ? 'Contação de História:' : isArtes ? 'Artes:' : `${normalizedCat}:`}\\nTítulo...\\n\\nProposta:\\n...\\n\\nImportante:\\n..."
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
          console.log('[Semanário IA] Ativando contingência pedagógica integrada (IA/créditos indisponíveis):', err?.status || 'indisponível');
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
          // Tenta extrair cada campo suportando tanto string quanto array ou objeto
          try {
            const extractRawValue = (key: string) => {
              const regex = new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\}|"[\\s\\S]*?")`, 'i');
              const match = cleaned.match(regex);
              if (!match) return '';
              try {
                return JSON.parse(match[1]);
              } catch {
                return match[1].replace(/^"|"$/g, '').replace(/\\"/g, '"');
              }
            };

            parsed = {
              title: extractRawValue('title') || 'Vivência pedagógica integrada',
              theme: extractRawValue('theme') || '',
              suggestedAdi: extractRawValue('suggestedAdi') || '',
              suggestedMonitor: extractRawValue('suggestedMonitor') || '',
              category: extractRawValue('category') || normalizedCat,
              livro: extractRawValue('livro') || '',
              versiculo: extractRawValue('versiculo') || '',
              proposta: extractRawValue('proposta') || extractRawValue('objectives') || '',
              dinamica: extractRawValue('dinamica') || extractRawValue('development') || '',
              atividades: extractRawValue('atividades') || extractRawValue('development') || '',
              materials: extractRawValue('materials') || '',
              importante: extractRawValue('importante') || extractRawValue('dicaMonitora') || '',
              formattedDevelopment: extractRawValue('formattedDevelopment') || '',
            };
          } catch {
            parsed = null;
          }
        }
      }
    }

    if (!parsed) {
      parsed = {
        title: cleanTheme ? `Vivência prática sobre ${cleanTheme}` : 'Vivência acolhedora integrada',
        theme: cleanTheme || 'Vivência pedagógica integrada',
        suggestedAdi: exactAdi || (staffList?.adis?.[0] || ''),
        suggestedMonitor: exactMonitor || (staffList?.monitors?.length ? staffList.monitors.join(' e ') : ''),
        category: normalizedCat,
        livro: isContacao ? 'O Monstro das Cores, de Anna Llenas (Editora Aletria).' : '',
        versiculo: isDevocional ? 'Lucas 6:31 - Como vocês querem que os outros lhes façam, façam também vocês a eles.' : '',
        proposta: 'proporcionar uma vivência acolhedora, participativa e cooperativa, promovendo a integração afetiva e a autonomia das crianças no espaço coletivo.',
        atividades: 'introduzir a proposta de forma lúdica e acolhedora, distribuindo os materiais e orientando as crianças passo a passo para que todas brinquem, colaborem e desfrutem juntas da dinâmica.',
        materials: '• Materiais pedagógicos da sala',
        importante: 'manter a atenção afetuosa a cada criança, acolhendo quem necessitar de mediação mais próxima e celebrando os avanços do grupo.',
      };
    }

    // Normaliza campos para string caso a IA tenha gerado arrays ou objetos aninhados
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

      // Se todo em maiúsculas ou title case forçado, converte para minúsculas
      title = title.toLowerCase();

      // Coloca apenas a 1ª letra em maiúscula
      title = title.charAt(0).toUpperCase() + title.slice(1);

      // Preserva nomes próprios e sagrados
      title = title
        .replace(/\bdeus\b/gi, 'Deus')
        .replace(/\bjesus\b/gi, 'Jesus')
        .replace(/\bbíblia\b/gi, 'Bíblia')
        .replace(/\bsenhor\b/gi, 'Senhor');

      // REGRA ESTRITA: NUNCA repetir o nome do tema da semana nem da categoria no título
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

      // Ajusta espaçamento e garante primeira maiúscula
      title = title.replace(/\s{2,}/g, ' ').trim();
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      return title || 'Vivência lúdica integrada';
    };

    // Garante que o início de cada bloco textual (Proposta, Atividades, Importante) comece em caixa baixa
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
    const propostaStr = cleanPedagogicalText(parsed?.proposta || parsed?.objectives || '');
    const dinamicaStr = cleanPedagogicalText(parsed?.atividades || parsed?.dinamica || parsed?.development || '');
    const versiculoStr = cleanPedagogicalText(parsed?.versiculo || '');
    const livroStr = cleanPedagogicalText(parsed?.livro || '');
    const materialsStr = cleanPedagogicalText(parsed?.materials || '');
    const importanteStr = cleanPedagogicalText(parsed?.importante || parsed?.dicaMonitora || '');

    // Formata lista de materiais com marcadores simples de bolinha
    const formatMaterialsLines = (rawMat: string): string => {
      if (!rawMat) return '';
      const lines = rawMat
        .split('\n')
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);
      if (lines.length === 0) return '';
      return lines.map((l) => `• ${l}`).join('\n');
    };

    const formattedMaterialsList = formatMaterialsLines(materialsStr);

    // Constrói a estrutura oficial exata da Escola Crescer para cada categoria seguindo a Matriz de Referência
    let finalFormattedDev = '';

    if (isDevocional) {
      finalFormattedDev = [
        `Devocional:`,
        finalTitle,
        '',
        `Proposta:`,
        ensureDiscretionaryLowerCase(
          propostaStr ||
            'proporcionar um momento sereno de reflexão sobre a gratidão e o amor de Deus, fortalecendo a convivência harmoniosa e a empatia no cotidiano escolar.'
        ),
        '',
        `Atividades:`,
        ensureDiscretionaryLowerCase(
          dinamicaStr ||
            'acomodar as crianças em roda acolhedora e conversar sobre pequenas atitudes de bondade no dia a dia. em seguida, realizar uma oração simples e participativa onde cada pequeno pode agradecer por um amigo ou pela família.'
        ),
        '',
        `Versículo:`,
        versiculoStr || 'Lucas 6:31 - Como vocês querem que os outros lhes façam, façam também vocês a eles.',
        '',
        `Importante:`,
        ensureDiscretionaryLowerCase(
          importanteStr ||
            'manter um clima de acolhimento sereno e escuta sensível, permitindo que todas as crianças se sintam seguras e amadas.'
        ),
      ].join('\n');
    } else if (isContacao) {
      finalFormattedDev = [
        `Contação de História:`,
        finalTitle,
        '',
        `Proposta:`,
        ensureDiscretionaryLowerCase(
          propostaStr ||
            'estimular a imaginação, a escuta atenta e o reconhecimento das emoções básicas através de fantoches simples e entonações de voz suaves.'
        ),
        '',
        `Atividades:`,
        ensureDiscretionaryLowerCase(
          dinamicaStr ||
            'acomodar os pequenos em almofadas no chão em semicírculo. apresentar os personagens da história com fantoches de feltro ou gravuras coloridas. contar a história com pausas dramáticas, usando expressões faciais e gestos corporais para ilustrar sentimentos como alegria, medo, calma e tristeza. ao final, convidar cada criança a dar um abraço afetuoso no fantoche da cor que ela mais gostou e imitar uma cara alegre junto com o monitor.'
        ),
        '',
        `Livro:`,
        livroStr || 'O Monstro das Cores, de Anna Llenas (Editora Aletria).',
        '',
        `Importante:`,
        ensureDiscretionaryLowerCase(
          importanteStr ||
            'respeitar o tempo de atenção dos pequenos, mantendo a contação entre dez e quinze minutos. acolher no colo quem demonstrar dispersão ou sensibilidade emocional durante a narrativa.'
        ),
      ].filter(Boolean).join('\n');
    } else if (isArtes) {
      const defaultPropostaArtes = isUpperElementary
        ? 'explorar técnicas de composição expressiva, estimulando a percepção estética, a paciência e a criatividade autônoma na produção artística.'
        : 'desenvolver a sensibilidade artística, a percepção de cores e formas e a coordenação motora fina em uma vivência plástica acolhedora.';

      const defaultDinamicaArtes = isUpperElementary
        ? 'apresentar referências de mosaicos e texturas; com mediação atenta da equipe, cada aluno traça suas linhas em suporte firme e preenche com pequenos fragmentos ou estudos de luz e sombra, valorizando o processo individual.'
        : 'organizar as bancadas com os suportes e tintas; as crianças exploram livremente as misturas de tons e texturas para compor sua produção com carinho e autonomia.';

      finalFormattedDev = [
        `Artes:`,
        finalTitle,
        '',
        `Proposta:`,
        ensureDiscretionaryLowerCase(propostaStr || defaultPropostaArtes),
        '',
        `Atividades:`,
        ensureDiscretionaryLowerCase(dinamicaStr || defaultDinamicaArtes),
        '',
        formattedMaterialsList ? `Materiais (se aplicável):\n${formattedMaterialsList}\n` : '',
        `Importante:`,
        ensureDiscretionaryLowerCase(
          importanteStr ||
            'respeitar o ritmo e a expressividade única de cada criação, valorizando o processo criativo e a autonomia individual.'
        ),
      ].filter(Boolean).join('\n');
    } else {
      finalFormattedDev = [
        `${normalizedCat}:`,
        finalTitle,
        '',
        `Proposta:`,
        ensureDiscretionaryLowerCase(
          propostaStr ||
            'proporcionar uma vivência participativa e cooperativa, promovendo a integração afetiva e a autonomia das crianças no espaço coletivo.'
        ),
        '',
        `Atividades:`,
        ensureDiscretionaryLowerCase(
          dinamicaStr ||
            'introduzir a proposta de forma lúdica e acolhedora, distribuindo os materiais e orientando as crianças passo a passo para que todas brinquem, colaborem e desfrutem juntas da dinâmica.'
        ),
        '',
        formattedMaterialsList ? `Materiais (se aplicável):\n${formattedMaterialsList}\n` : '',
        `Importante:`,
        ensureDiscretionaryLowerCase(
          importanteStr ||
            'manter a atenção afetuosa a cada criança, acolhendo quem necessitar de mediação mais próxima e celebrando os avanços do grupo.'
        ),
      ].filter(Boolean).join('\n');
    }

    // Regra de geração estritamente ÚNICA: Garante que o texto para imediatamente após a seção 'Importante:'
    const importanteIndex = finalFormattedDev.indexOf('Importante:');
    if (importanteIndex !== -1) {
      const afterImp = finalFormattedDev.slice(importanteIndex);
      // Se houver uma quebra dupla após a descrição de Importante seguida de nova atividade, corta
      const nextSectionMatch = afterImp.search(/\n\n[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+:\s*\n/);
      if (nextSectionMatch !== -1) {
        finalFormattedDev = finalFormattedDev.slice(0, importanteIndex + nextSectionMatch).trim();
      }
    }

    // Fonte prioritária e mandatória: Quadro de Atribuições vinculado à turma
    const finalAdi = exactAdi || (typeof parsed?.suggestedAdi === 'string' && parsed.suggestedAdi.trim() ? cleanPedagogicalText(parsed.suggestedAdi) : (staffList?.adis?.[0] || ''));
    const finalMonitor = exactMonitor || (typeof parsed?.suggestedMonitor === 'string' && parsed.suggestedMonitor.trim() ? cleanPedagogicalText(parsed.suggestedMonitor) : (staffList?.monitors?.length ? staffList.monitors.join(' e ') : ''));

    const normalizedProposal = {
      title: finalTitle,
      theme: typeof parsed?.theme === 'string' && parsed.theme.trim() ? cleanPedagogicalText(parsed.theme) : (cleanTheme || ''),
      suggestedAdi: finalAdi,
      suggestedMonitor: finalMonitor,
      category: normalizedCat,
      livro: livroStr || undefined,
      versiculo: versiculoStr || undefined,
      objectives: propostaStr || 'Vivência pedagógica acolhedora e integrada',
      development: finalFormattedDev, // Preenche a descrição com a estrutura oficial completa da Escola Crescer
      materials: formattedMaterialsList || materialsStr,
      formattedDevelopment: finalFormattedDev,
      dicaMonitora: importanteStr,
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

// Helper: Gerador pedagógico oficial de contingência baseado em CNV e cuidado às crianças
function buildServerFallbackCordialFeedback(
  userName: string,
  normTitle: string,
  rawContext: string,
  normSection?: string,
  normDetails?: string[]
): { message: string; actionPoints: string[] } {
  const { salutation, firstName } = getSalutationForName(userName);
  const sectionLabel = normSection ? ` (Seção ${normSection})` : '';

  const message = `Olá, ${salutation} ${firstName}!

Esperamos que seu dia esteja sendo abençoado. Gostaríamos de começar expressando nosso sincero agradecimento pelo seu carinho, dedicação e energia investidos diariamente no acompanhamento dos nossos pequenos no Programa do Integral do Colégio Crescer. Seu papel é fundamental na vida de cada criança!

No espírito de diálogo aberto e contínuo aprimoramento da nossa equipe, gostaríamos de compartilhar uma orientação construtiva sobre uma situação observada recentemente:
**"${rawContext.trim()}"**

Gostaríamos de revisitar com você a norma institucional **"${normTitle}"${sectionLabel}**. No Colégio Crescer, cada uma dessas diretrizes existe com um único propósito supremo: garantir a integridade física, o acolhimento emocional e a segurança permanente de todas as crianças sob nossa responsabilidade. Quando zelamos por esses detalhes da rotina, construímos um ambiente verdadeiramente protegido e sereno para que os alunos possam florescer.

Contamos imensamente com a sua sensibilidade e parceria para mantermos esse alinhamento no dia a dia. Você faz a diferença em nosso colégio!

Atenciosamente,
Coordenação do Integral • Colégio Crescer`;

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
        const prompt = `Você é um coordenador pedagógico experiente, acolhedor e empático do Colégio Crescer.
Sua missão é redigir um feedback individual fundamentado estritamente na Comunicação Não-Violenta (CNV) para o(a) colaborador(a) ${userName}.

Diretrizes Obrigatórias de Formatação e Linguagem:
1. Saudação Inicial com Flexão de Gênero Estrita:
   - Inicie a mensagem OBRIGATORIAMENTE com: "Olá, ${salutation} ${firstName}!"
2. Destaques Obrigatórios em Negrito (**):
   - Formate o fato ocorrido observado OBRIGATORIAMENTE em negrito com aspas e asteriscos duplos: **"${rawContext.trim()}"**
   - Formate o título da norma institucional e sua seção OBRIGATORIAMENTE em negrito: **${normFullRef}**
3. Pilares Obrigatórios da Comunicação Não-Violenta (CNV):
   - Acolhimento e Valorização: Inicie com carinho e reconhecendo a dedicação no cuidado com as crianças.
   - Observação Serena dos Fatos: Descreva o ocorrido de forma respeitosa e serena, sem julgamentos depreciativos ou tom punitivo.
   - Significado Pedagógico e Proteção às Crianças: Enfatize que o objetivo supremo de nossas diretrizes no Colégio Crescer é a segurança física, o bem-estar emocional e o desenvolvimento das crianças.
   - Pedido e Orientação Construtiva: Apresente o direcionamento de forma clara e encorajadora.
   - Encerramento: Finalize exatamente com:
Atenciosamente,
Coordenação do Integral • Colégio Crescer

Contexto:
- Nome: ${userName}
- Norma Institucional: ${normFullRef}
- Fato Ocorrido: "${rawContext}"
- Diretrizes da Norma: ${Array.isArray(normDetails) && normDetails.length > 0 ? normDetails.join('; ') : 'Normas de conduta e rotina pedagógica do Colégio Crescer'}

Gere uma resposta estritamente em JSON no seguinte formato:
{
  "message": "Texto completo da mensagem cordial iniciando em 'Olá, ${salutation} ${firstName}!' com os destaques em ** e finalizando em 'Coordenação do Integral • Colégio Crescer'...",
  "actionPoints": [
    "Ponto prático 1 de atenção e cuidado que a monitora deve seguir",
    "Ponto prático 2 de alinhamento com a segurança das crianças",
    "Ponto prático 3 de compromisso pedagógico institucional"
  ]
}`;

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
          let messageText: string = parsed.message.trim();

          // Pós-processamento de garantia: assegura saudação correta
          if (!messageText.startsWith(`Olá, ${salutation}`)) {
            messageText = messageText.replace(/^Olá,\s*(?:querid[oa]|colaborador[a]?|amig[oa])\s+[^!\n]+!/i, `Olá, ${salutation} ${firstName}!`);
            if (!messageText.startsWith(`Olá, ${salutation}`)) {
              messageText = `Olá, ${salutation} ${firstName}!\n\n${messageText}`;
            }
          }

          // Pós-processamento de garantia: assegura negrito no fato e na norma
          const rawTrimmed = rawContext.trim();
          if (!messageText.includes(`**"${rawTrimmed}"**`) && messageText.includes(rawTrimmed)) {
            messageText = messageText.replace(`"${rawTrimmed}"`, `**"${rawTrimmed}"**`);
            if (!messageText.includes(`**"${rawTrimmed}"**`)) {
              messageText = messageText.replace(rawTrimmed, `**"${rawTrimmed}"**`);
            }
          }

          if (!messageText.includes(`**${normFullRef}**`) && messageText.includes(normTitle)) {
            messageText = messageText.replace(`"${normTitle}"${sectionLabel}`, `**${normFullRef}**`);
            if (!messageText.includes(`**${normFullRef}**`)) {
              messageText = messageText.replace(`"${normTitle}"`, `**${normFullRef}**`);
            }
          }

          // Pós-processamento de garantia: assinatura institucional estrita
          messageText = messageText.replace(/\n+(?:Um abraço fraterno,?|Atenciosamente,?|Fraternalmente,?)\s*\n+.*$/is, '');
          messageText = messageText.replace(/\n+\*?(?:Coordenação (?:do Integral|Pedagógica) • Colégio Crescer)\*?$/is, '');
          messageText = `${messageText.trim()}\n\nAtenciosamente,\nCoordenação do Integral • Colégio Crescer`;

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
