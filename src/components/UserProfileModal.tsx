import React from 'react';
import { UserProfileModal, UserProfileModalProps } from './UserProfile';

/**
 * Re-exportação do componente UserProfileModal para garantir resolução
 * tanto pelo caminho /UserProfile quanto /UserProfileModal.
 */
export { UserProfileModal };
export type { UserProfileModalProps };
export default UserProfileModal;
