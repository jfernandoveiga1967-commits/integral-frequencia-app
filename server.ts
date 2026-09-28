import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

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
        if (attempts >= 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    const responseText = response?.text || '';
    let parsed: any = null;
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
          throw new Error('Falha na interpretação da resposta JSON');
        }
      }
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
