import { AuthGuard } from '@/components/providers/auth-guard';
import { WorkspaceLayout } from '@/components/layout/workspace-layout';

/**
 * Workspace route group layout.
 * All routes under /(workspace)/ require authentication.
 * AuthGuard verifies the HttpOnly cookie session on mount.
 */
export default function WorkspaceGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </AuthGuard>
  );
}
