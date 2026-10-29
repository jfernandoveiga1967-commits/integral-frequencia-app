/**
 * SofiaAssistant.tsx
 * Ponto de exportação e compatibilidade do Agente de IA Oficial Sofia.
 * Integra o novo SofiaAgent autônomo e resolutivo com suporte a Function Calling e RAG Local.
 */

import React from 'react';
import { SofiaAgent, SofiaAgentProps } from './SofiaAgent';
import { SofiaActionPayload } from '../types';

export interface SofiaAssistantMessage {
  id: string;
  sender: 'user' | 'sofia';
  text: string;
  timestamp: string;
  action?: SofiaActionPayload;
}

export type SofiaAssistantProps = SofiaAgentProps & {
  onOpenFeedbacks?: () => void;
};

export const SofiaAssistant: React.FC<SofiaAssistantProps> = (props) => {
  return <SofiaAgent {...props} />;
};

export default SofiaAssistant;
export { SofiaAssistant as VoiceWidget, SofiaAgent };
