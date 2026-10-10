CREATE TABLE IF NOT EXISTS opportunity_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  channel TEXT,
  executed_by TEXT NOT NULL,
  notes TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_opp_actions_workspace_opp ON opportunity_actions(workspace_id, opportunity_id);

ALTER TABLE opportunity_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for opportunity_actions select" ON opportunity_actions
  FOR SELECT USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for opportunity_actions insert" ON opportunity_actions
  FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id));

CREATE TABLE IF NOT EXISTS opportunity_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  recovered_amount_cents INTEGER NOT NULL DEFAULT 0,
  time_to_recovery_seconds INTEGER,
  settlement_method TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  feedback_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_opp_outcomes_workspace_opp ON opportunity_outcomes(workspace_id, opportunity_id);

ALTER TABLE opportunity_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for opportunity_outcomes select" ON opportunity_outcomes
  FOR SELECT USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Tenant isolation for opportunity_outcomes insert" ON opportunity_outcomes
  FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id));
