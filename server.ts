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

// API Route: Gerador de Propostas Pedagógicas com Gemini
app.post('/api/gemini/generate-proposal', async (req, res) => {
  try {
    const { turma, category, theme, dayOfWeek, date } = req.body;

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chave GEMINI_API_KEY não configurada no ambiente.',
        useFallback: true,
      });
    }

    const prompt = `Você é um coordenador pedagógico sênior especialista em Educação Integral infantil e fundamental (Colégio Crescer).
Crie uma proposta pedagógica rica, engajadora, prática e viável para o Semanário do Programa Integral.

Dados da turma e atividade:
- Turma / Faixa Etária: ${turma || 'Ensino Fundamental'}
- Categoria Pedagógica / Modalidade: ${category || 'Atividade Geral'}
- Tema / Foco opcional: ${theme ? theme : 'Desenvolvimento integral, ludicidade, cooperação e autonomia'}
- Dia da semana e data: ${dayOfWeek || ''} ${date ? `(${date})` : ''}

Diretrizes Pedagógicas Obrigatórias:
1. Adaptação Estrita à Faixa Etária da Turma:
   - Se a turma for Berçário, Mini Maternal, Maternal ou Infantil (1 ou 2): Trata-se de Educação Infantil (crianças de 1 a 5 anos). Use linguagem e dinâmicas adequadas à primeira infância, com foco em Campos de Experiências da BNCC (ex: O eu, o outro e o nós; Corpo, gestos e movimentos), brincadeiras sensoriais, cantigas, exploração lúdica e segurança.
   - Se a turma for do Ensino Fundamental (1º ao 6º Ano): Trata-se de crianças e pré-adolescentes de 6 a 12 anos. Proponha dinâmicas compatíveis com a maturidade do grupo, desafios cooperativos, raciocínio estratégico, regras de convivência e projetos em grupo da BNCC.
2. Variação de Conteúdo: Leve em consideração a data e o dia específico para propor uma vivência inédita e dinâmica para este dia (evitando atividades genéricas repetidas).
3. Estrutura da Resposta:
   - Título criativo e lúdico com identificação clara da atividade.
   - Objetivos claros (desenvolvimento motor, cognitivo, socioemocional ou BNCC).
   - Desenvolvimento metodológico direto em 3 etapas (1. Acolhimento, 2. Desenvolvimento/Exploração, 3. Fechamento/Reflexão).
   - Materiais simples e acessíveis no ambiente escolar.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato abaixo, sem aspas duplas desescapadas dentro dos textos:
{
  "title": "Título Criativo e Específico da Proposta",
  "objectives": "Objetivos claros de aprendizagem e desenvolvimento para a faixa etária.",
  "development": "1. Acolhimento e introdução lúdica...\\n2. Passo a passo prático da exploração...\\n3. Fechamento e reflexão coletiva.",
  "materials": "Lista prática de materiais necessários."
}`;

    let response: any = null;
    let attempts = 0;
    while (attempts < 2) {
      try {
        attempts++;
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
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
      // If parsing raw output fails, attempt to strip markdown code fences
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback: extrai campos individualmente com regex se o JSON tiver ficado imperfeito
        const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
        const objMatch = cleaned.match(/"objectives"\s*:\s*"([^"]+)"/);
        const devMatch = cleaned.match(/"development"\s*:\s*"([^"]+)"/);
        const matMatch = cleaned.match(/"materials"\s*:\s*"([^"]+)"/);
        if (titleMatch) {
          parsed = {
            title: titleMatch[1],
            objectives: objMatch ? objMatch[1] : '',
            development: devMatch ? devMatch[1] : '',
            materials: matMatch ? matMatch[1] : '',
          };
        } else {
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

    const normalizedProposal = {
      title: typeof parsed?.title === 'string' ? parsed.title : (parsed?.title?.name || parsed?.title || 'Proposta Pedagógica'),
      objectives: toStringField(parsed?.objectives),
      development: toStringField(parsed?.development),
      materials: toStringField(parsed?.materials),
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
