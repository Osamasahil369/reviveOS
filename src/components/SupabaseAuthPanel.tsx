import React from 'react';
import { AuthSession } from '../types/index.js';
import { AdminDevToolsModal } from './AdminDevToolsModal.js';

interface SupabaseAuthPanelProps {
  currentWorkspaceId: string;
  isDemoWorkspace?: boolean;
  onWorkspaceChange?: (wsId: string) => void;
  onSessionUpdated?: (session: AuthSession) => void;
}

/**
 * SupabaseAuthPanel
 * Backward-compatible wrapper that renders the internal developer diagnostics modal
 * to prevent legacy breaking changes while keeping the user-facing login clean.
 */
export const SupabaseAuthPanel: React.FC<SupabaseAuthPanelProps> = ({
  currentWorkspaceId,
  isDemoWorkspace = false,
  onSessionUpdated,
}) => {
  return (
    <div className="w-full">
      <AdminDevToolsModal
        isOpen={true}
        onClose={() => {}}
        currentWorkspaceId={currentWorkspaceId}
        isDemoWorkspace={isDemoWorkspace}
        onSessionUpdated={onSessionUpdated}
      />
    </div>
  );
};
