import { getSupabaseServerClient, isSupabaseConfigured } from './supabaseClient.js';
import { db } from '../store/db.js';

export interface TableInspection {
  name: string;
  description: string;
  rowCount: number;
  primaryKey: string;
  columns: string[];
}

export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  const client = getSupabaseServerClient();
  if (!client) {
    return {
      connected: false,
      error: 'Supabase credentials not configured or using development placeholder values.',
    };
  }
  try {
    const { error } = await client.from('workspaces').select('id', { count: 'exact', head: true });
    if (error) {
      return { connected: false, error: error.message };
    }
    return { connected: true };
  } catch (err: any) {
    return { connected: false, error: err.message || 'Connection failed' };
  }
}

export async function syncLocalToSupabase(): Promise<{
  success: boolean;
  syncedTables: string[];
  errors: string[];
}> {
  const client = getSupabaseServerClient();
  if (!client) {
    return {
      success: false,
      syncedTables: [],
      errors: ['Supabase client not available. Operating in durable file-backed persistence mode.'],
    };
  }

  const syncedTables: string[] = [];
  const errors: string[] = [];

  const rawData = db.exportFullDatabase();

  // Helper to upsert batches
  const upsertTable = async (tableName: string, rows: any[]) => {
    if (!rows || rows.length === 0) return;
    try {
      const { error } = await client.from(tableName).upsert(rows);
      if (error) {
        errors.push(`${tableName}: ${error.message}`);
      } else {
        syncedTables.push(tableName);
      }
    } catch (e: any) {
      errors.push(`${tableName}: ${e.message}`);
    }
  };

  await upsertTable('workspaces', rawData.workspaces);
  await upsertTable('users', rawData.users);
  await upsertTable('memberships', rawData.memberships);
  await upsertTable('customers', rawData.customers);
  await upsertTable('subscriptions', rawData.subscriptions);
  await upsertTable('invoices', rawData.invoices);
  await upsertTable('payments', rawData.payments);
  await upsertTable('payment_failures', rawData.paymentFailures);
  await upsertTable('recovery_campaigns', rawData.recoveryCampaigns);
  await upsertTable('recovery_opportunities', rawData.recoveryOpportunities);
  await upsertTable('recovery_events', rawData.recoveryEvents);
  await upsertTable('revenue_events', rawData.revenueEvents);
  await upsertTable('audit_logs', rawData.auditLogs);

  return {
    success: errors.length === 0,
    syncedTables,
    errors,
  };
}
