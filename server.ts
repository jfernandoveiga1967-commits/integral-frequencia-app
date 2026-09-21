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

// API Route: Gerador de Propostas Pedagógicas com Gemini (Restrito a Coordenadores)
app.post('/api/gemini/generate-proposal', async (req, res) => {
  try {
    const userRole = (
      (req.headers['x-user-role'] as string) ||
      req.body?.user?.role ||
      req.body?.userRole ||
      ''
    ).toLowerCase();

    // Validação estrita de perfil: somente Coordenadores podem solicitar geração por IA
    if (userRole !== 'coordenador') {
      return res.status(403).json({
        error: 'Acesso negado: A geração de propostas pedagógicas com inteligência artificial é restrita exclusivamente a Coordenadores.',
        forbidden: true,
      });
    }

    const { turma, category, theme, dayOfWeek, date } = req.body;

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Chave GEMINI_API_KEY não configurada no ambiente.',
        useFallback: true,
      });
    }

    const prompt = `Você é um coordenador pedagógico sênior especialista em Educação Integral infantil e fundamental (Colégio Crescer).
Crie uma proposta pedagógica rica, prática e viável para o Semanário do Programa Integral.

Dados da turma e atividade:
- Turma / Faixa Etária: ${turma || 'Ensino Fundamental'}
- Categoria Pedagógica / Modalidade: ${category || 'Atividade Geral'}
- Tema / Foco opcional: ${theme ? theme : 'Desenvolvimento integral, ludicidade, cooperação e autonomia'}
- Dia da semana e data: ${dayOfWeek || ''} ${date ? `(${date})` : ''}

Diretrizes Pedagógicas Obrigatórias:
1. Adaptação Estrita à Faixa Etária:
   - Se Educação Infantil (Berçário, Mini Maternal, Maternal, Infantil 1 ou 2): crianças de 1 a 5 anos. Use linguagem de primeira infância, ludicidade, cantigas, exploração sensorial, segurança e Campos de Experiências da BNCC (EI02CG01, EI02CG02, etc.).
   - Se Ensino Fundamental (1º ao 6º Ano): crianças de 6 a 12 anos. Proponha desafios, cooperação estratégica, regras, autonomia e habilidades da BNCC (EF35EF01, etc.).
2. Concisão Funcional: O texto deve ser direto e estruturado para caber com elegância no fichamento do professor.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown extra, com aspas devidamente escapadas):
{
  "title": "Título Criativo e Específico da Proposta",
  "objectives": "2 a 3 objetivos claros de desenvolvimento e códigos BNCC.",
  "development": "1. Acolhimento: introdução lúdica.\\n2. Atividade Prática: vivência passo a passo.\\n3. Fechamento: roda de conversa e volta à calma.",
  "materials": "Lista direta dos materiais necessários."
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
            title: extractRawValue('title') || 'Proposta Pedagógica',
            objectives: extractRawValue('objectives') || '',
            development: extractRawValue('development') || '',
            materials: extractRawValue('materials') || '',
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
