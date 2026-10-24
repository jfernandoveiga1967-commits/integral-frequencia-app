import React from 'react';
import { GestaoFeedbacksModal } from './GestaoFeedbacksModal';
import { UserProfile, PedagogicalFeedback } from '../types';

export interface FeedbackModuleProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentUser?: UserProfile | null;
  users?: UserProfile[];
  initialNormId?: string;
  initialChecklistItem?: string;
}

/**
 * Módulo de Gerenciamento e Elaboração de Feedbacks Pedagógicos Cordiais (CNV).
 * Permite elaboração com IA, histórico, ciência com checklist e exclusão individual com confirmação de segurança.
 */
export const FeedbackModule: React.FC<FeedbackModuleProps> = ({
  isOpen = true,
  onClose = () => {},
  currentUser,
  users,
  initialNormId,
  initialChecklistItem,
}) => {
  return (
    <GestaoFeedbacksModal
      isOpen={isOpen}
      onClose={onClose}
      currentUser={currentUser}
      users={users}
      initialNormId={initialNormId}
      initialChecklistItem={initialChecklistItem}
    />
  );
};

export default FeedbackModule;
export { GestaoFeedbacksModal };
