import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

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
    const { turma, category, theme, dayOfWeek } = req.body;

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
- Turma: ${turma || 'Ensino Fundamental'}
- Categoria Pedagógica: ${category || 'Atividade Geral'}
- Tema / Foco opcional: ${theme ? theme : 'Desenvolvimento integral, ludicidade e cooperação'}
- Dia da semana: ${dayOfWeek || 'Durante a semana'}

Regras Pedagógicas:
1. Alinhamento com a BNCC (Base Nacional Comum Curricular).
2. Título criativo e lúdico.
3. Objetivos claros de desenvolvimento (cognitivo, motor, socioemocional ou artístico).
4. Desenvolvimento metodológico dividido em etapas (1. Acolhimento, 2. Desenvolvimento/Exploração, 3. Fechamento/Reflexão).
5. Lista de materiais e recursos necessários acessíveis no ambiente escolar.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "title": "Título Criativo e Claro da Proposta",
  "objectives": "Objetivos claros de aprendizagem e habilidades desenvolvidas (BNCC).",
  "development": "1. Acolhimento e contextualização...\\n2. Passo a passo da atividade...\\n3. Roda de fechamento e reflexão coletiva.",
  "materials": "Lista de materiais necessários."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    let parsed = null;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // If parsing raw output fails, attempt to strip markdown code fences
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    return res.json({
      success: true,
      proposal: parsed,
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
    });
    app.use(vite.middlewares);
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
