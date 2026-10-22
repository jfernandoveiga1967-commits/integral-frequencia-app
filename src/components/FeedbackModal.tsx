import React from 'react';
import { GestaoFeedbacksModal } from './GestaoFeedbacksModal';
import { UserProfile } from '../types';

export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  users?: UserProfile[];
  initialNormId?: string;
  initialChecklistItem?: string;
}

/**
 * Componente modal de gestão e elaboração de feedbacks pedagógicos cordiais (CNV).
 * Alias oficial para GestaoFeedbacksModal, garantindo compatibilidade estrita.
 */
export const FeedbackModal: React.FC<FeedbackModalProps> = (props) => {
  return <GestaoFeedbacksModal {...props} />;
};

export default FeedbackModal;
export { GestaoFeedbacksModal };
