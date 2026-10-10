CREATE TABLE IF NOT EXISTS copilot_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  state_before TEXT NOT NULL,
  state_after TEXT NOT NULL,
  executed_by TEXT NOT NULL,
  provider_reference TEXT,
  result_status TEXT NOT NULL,
  failure_reason TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_logs_workspace_opportunity ON copilot_execution_logs(workspace_id, opportunity_id);

ALTER TABLE copilot_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for copilot_execution_logs select" ON copilot_execution_logs
  FOR SELECT USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for copilot_execution_logs insert" ON copilot_execution_logs
  FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id));
