import { CanonicalBatch } from './canonicalSchema.js';

export type SourceCategory =
  | 'payments'
  | 'ecommerce'
  | 'accounting'
  | 'crm'
  | 'files'
  | 'databases'
  | 'universal_api';

export interface ConnectorConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea' | 'file';
  required: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: Array<{ label: string; value: string }>;
  description?: string;
}

export interface ConnectorCapabilities {
  syncMode: 'pull_api' | 'push_webhook' | 'file_upload' | 'db_query' | 'universal_api';
  supportsIncrementalSync: boolean;
  supportsTestConnection: boolean;
  supportsDirectRetry: boolean;
  supportedEntities: Array<'customers' | 'subscriptions' | 'invoices' | 'payments' | 'failures'>;
}

export interface ConnectorTestResult {
  connected: boolean;
  message: string;
  latencyMs?: number;
  details?: Record<string, any>;
  error?: string;
}

export interface ConnectorPullParams {
  workspaceId: string;
  config: Record<string, any>;
  since?: string;
  limit?: number;
  customData?: any;
}

export interface IRevenueConnector {
  readonly id: string;
  readonly name: string;
  readonly category: SourceCategory;
  readonly description: string;
  readonly icon?: string;
  readonly version: string;
  readonly capabilities: ConnectorCapabilities;
  readonly configSchema: ConnectorConfigField[];

  testConnection(config: Record<string, any>): Promise<ConnectorTestResult>;
  pull(params: ConnectorPullParams): Promise<CanonicalBatch>;
  normalize(rawPayload: any, context?: any): CanonicalBatch;
}

export interface IngestionJobRecord {
  id: string;
  workspaceId: string;
  connectorId: string;
  connectorName: string;
  category: SourceCategory;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  recordsExtracted: number;
  customersIngested: number;
  subscriptionsIngested: number;
  invoicesIngested: number;
  paymentsIngested: number;
  failuresIngested: number;
  opportunitiesGenerated: number;
  totalAtRiskCents: number;
  currency: string;
  error?: string;
  downstreamPipelineSummary?: {
    scannerExecuted: boolean;
    missionsUpdated: boolean;
    autopilotTriggered: boolean;
    emailRecoveryQueued: boolean;
    revenueBrainRefreshed: boolean;
  };
}

export interface IngestionSummaryMetrics {
  totalConnectorsAvailable: number;
  totalSourcesConnected: number;
  totalIngestionJobsRun: number;
  totalCustomersUnified: number;
  totalAtRiskRevenueCents: number;
  totalRecoverableRevenueCents: number;
  breakdownByCategory: Record<SourceCategory, { connectorsCount: number; recordsCount: number }>;
}
