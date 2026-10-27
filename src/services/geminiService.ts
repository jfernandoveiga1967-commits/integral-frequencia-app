/**
 * geminiService.ts
 * Exportações e serviços da Gemini API para agentes inteligentes do Colégio Crescer.
 */

export {
  querySofiaAgent,
  executeAttendanceAction,
  executeNormaConsultation,
  buildCurrentAppContext,
} from './sofiaAgentService';

export type {
  SofiaAgentContext,
  SofiaQueryInput,
} from './sofiaAgentService';

export {
  buildSofiaSystemPrompt,
  SOFIA_DEFAULT_TEMPERATURE,
  SOFIA_DEFAULT_MODEL,
} from '../utils/sofiaPromptBuilder';

export type {
  SofiaContextData,
} from '../utils/sofiaPromptBuilder';
