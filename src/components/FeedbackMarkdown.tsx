import React from 'react';

export interface FeedbackMarkdownProps {
  content: string;
  className?: string;
  paragraphClassName?: string;
  highlightVariant?: 'teal' | 'indigo' | 'slate';
}

/**
 * Converte marcações inline de Markdown (*texto*, **texto**, ***texto***)
 * em elementos React <strong> devidamente estilizados, removendo qualquer
 * asterisco cru da interface.
 */
export function parseInlineMarkdown(
  line: string,
  variant: 'teal' | 'indigo' | 'slate' = 'teal'
): React.ReactNode[] {
  if (!line) return [];

  const highlightClasses = {
    teal: 'font-black text-slate-900 bg-teal-100/70 px-1 py-0.5 rounded shadow-2xs',
    indigo: 'font-black text-slate-900 bg-indigo-100/70 px-1 py-0.5 rounded shadow-2xs',
    slate: 'font-black text-slate-900 bg-slate-200/80 px-1 py-0.5 rounded',
  }[variant];

  // Identifica marcações de negrito e itálico: ***texto***, **texto**, *texto*
  const tokenRegex = /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Negrito com 3 asteriscos: ***texto***
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      const content = part.slice(3, -3).trim();
      return (
        <strong key={index} className={highlightClasses}>
          {content}
        </strong>
      );
    }

    // Negrito clássico com 2 asteriscos: **texto**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const content = part.slice(2, -2).trim();
      return (
        <strong key={index} className={highlightClasses}>
          {content}
        </strong>
      );
    }

    // Negrito WhatsApp com 1 asterisco: *texto*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const content = part.slice(1, -1).trim();
      return (
        <strong key={index} className={highlightClasses}>
          {content}
        </strong>
      );
    }

    // Remove eventuais asteriscos soltos órfãos no texto simples
    const cleanText = part.replace(/\*/g, '');
    return <React.Fragment key={index}>{cleanText}</React.Fragment>;
  });
}

/**
 * Remove todos os asteriscos de formatação Markdown de uma string,
 * útil para envio a serviços legados ou visualizações estritamente em texto puro.
 */
export function stripMarkdownAsterisks(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\*/g, '')
    .trim();
}

/**
 * Componente React de alta legibilidade para mensagens pedagógicas e feedbacks.
 * Interpreta parágrafos (\n\n), quebras de linha (\n) e destaques em negrito (* / **),
 * eliminando toda sintaxe crua de asteriscos.
 */
export const FeedbackMarkdown: React.FC<FeedbackMarkdownProps> = ({
  content,
  className = '',
  paragraphClassName = 'leading-relaxed',
  highlightVariant = 'teal',
}) => {
  if (!content) return null;

  // Divide por múltiplos saltos de linha para formar parágrafos semânticos
  const paragraphs = content.split(/\n{2,}/);

  return (
    <div className={`space-y-3 font-sans ${className}`}>
      {paragraphs.map((p, pIdx) => {
        const trimmed = p.trim();
        if (!trimmed) return null;

        // Quebras simples de linha dentro do mesmo parágrafo (ex: assinatura institucional)
        const lines = trimmed.split('\n');

        return (
          <p key={pIdx} className={paragraphClassName}>
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {parseInlineMarkdown(line, highlightVariant)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

export default FeedbackMarkdown;
