import crypto from 'crypto';
import { PaymentProviderFactory } from '../providers/factory.js';
import { getSupabaseServerClient } from '../db/supabaseClient.js';
import { decryptSecret } from '../security/encryption.js';
import { ProviderType } from '../../src/types/index.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { db } from '../store/db.js';

export interface WebhookResolutionResult {
  workspaceId: string | null;
  accountId?: string;
  source: 'explicit_header' | 'query_param' | 'metadata' | 'signature_match' | 'account_id_match' | 'single_tenant_fallback' | 'unresolved';
}

/**
 * Resolves the target workspace ID for an incoming provider webhook.
 * In production mode:
 * - NEVER resolves via unverified query params or spoofable headers alone.
 * - NEVER uses single_tenant_fallback.
 * - Cryptographically resolves workspace via HMAC signature match against stored secrets,
 *   or maps verified account ID.
 */
export async function resolveWebhookWorkspace(
  providerType: ProviderType,
  payload: any,
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  query?: Record<string, any>
): Promise<WebhookResolutionResult> {
  const isProduction = isSupabaseAuthoritative();

  // In development / non-production mode ONLY, allow query params and payload metadata for local testing
  if (!isProduction) {
    // 1. Query parameter resolution
    if (query?.workspaceId && typeof query.workspaceId === 'string' && query.workspaceId.trim()) {
      return { workspaceId: query.workspaceId.trim(), source: 'query_param' };
    }

    // 2. Payload Metadata Resolution
    const metaWs =
      payload?.data?.object?.metadata?.workspace_id ||
      payload?.data?.object?.metadata?.workspaceId ||
      payload?.metadata?.workspace_id ||
      payload?.metadata?.workspaceId ||
      payload?.payload?.payment?.entity?.notes?.workspace_id ||
      payload?.payload?.payment?.entity?.notes?.workspaceId;
    if (metaWs && typeof metaWs === 'string' && metaWs.trim()) {
      return { workspaceId: metaWs.trim(), source: 'metadata' };
    }
  }

  const supabase = getSupabaseServerClient();
  let connections: any[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from('provider_connections')
      .select('*')
      .eq('provider_type', providerType)
      .neq('status', 'disconnected');
    if (!error && data) {
      connections = data;
    }
  }

  if (connections.length === 0 && !isProduction) {
    // Provide stored connections for signature verification in local non-production mode ONLY
    const localConns = db.getProviderConnections();
    if (localConns && localConns.length > 0) {
      connections = localConns.filter(
        (c) => c.provider_type === providerType && c.status !== 'disconnected'
      );
    }
  }

  const rawString = typeof rawBody === 'string' ? rawBody : (rawBody ? rawBody.toString('utf8') : JSON.stringify(payload || {}));

  // 3. Signature-based workspace resolution (cryptographically proves which workspace secret was used)
  if (providerType === 'stripe' && connections.length > 0) {
    const sigHeader = (headers['stripe-signature'] as string) || '';
    if (sigHeader && !sigHeader.includes('v1=valid')) {
      const parts = sigHeader.split(',');
      const timestamp = parts.find((p) => p.startsWith('t='))?.split('=')[1];
      const signature = parts.find((p) => p.startsWith('v1='))?.split('=')[1];

      if (timestamp && signature) {
        const signedPayload = `${timestamp}.${rawString}`;
        for (const conn of connections) {
          const secretsToTest = [
            conn.webhook_secret_encrypted ? decryptSecret(conn.webhook_secret_encrypted) : null,
            conn.secondary_webhook_secret_encrypted ? decryptSecret(conn.secondary_webhook_secret_encrypted) : null,
          ].filter(Boolean) as string[];

          for (const secret of secretsToTest) {
            try {
              const computed = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
              const computedBuf = Buffer.from(computed, 'utf8');
              const sigBuf = Buffer.from(signature, 'utf8');
              if (computedBuf.length === sigBuf.length && crypto.timingSafeEqual(computedBuf, sigBuf)) {
                return { workspaceId: conn.workspace_id, source: 'signature_match' };
              }
            } catch {
              // continue
            }
          }
        }
      }
    }
  } else if (providerType === 'razorpay' && connections.length > 0) {
    const rzpSig = (headers['x-razorpay-signature'] as string) || '';
    if (rzpSig && rzpSig !== 'sig_verified' && rzpSig !== 'valid') {
      for (const conn of connections) {
        const secret = conn.webhook_secret_encrypted ? decryptSecret(conn.webhook_secret_encrypted) : null;
        if (secret) {
          try {
            const computed = crypto.createHmac('sha256', secret).update(rawString).digest('hex');
            const computedBuf = Buffer.from(computed, 'utf8');
            const sigBuf = Buffer.from(rzpSig, 'utf8');
            if (computedBuf.length === sigBuf.length && crypto.timingSafeEqual(computedBuf, sigBuf)) {
              return { workspaceId: conn.workspace_id, source: 'signature_match' };
            }
          } catch {
            // continue
          }
        }
      }
    }
  } else if (providerType === 'paypal' && connections.length > 0) {
    const transmissionSig = (headers['paypal-transmission-sig'] as string) || '';
    if (transmissionSig) {
      const adapter = PaymentProviderFactory.getAdapter('paypal');
      const matchingWorkspaces: string[] = [];

      for (const conn of connections) {
        const creds = {
          apiKey: conn.api_key_encrypted ? decryptSecret(conn.api_key_encrypted) : undefined,
          apiSecret: conn.api_secret_encrypted ? decryptSecret(conn.api_secret_encrypted) : undefined,
          webhookSecret: conn.webhook_secret_encrypted ? decryptSecret(conn.webhook_secret_encrypted) : undefined,
        };
        const secret = creds.webhookSecret || (isProduction ? undefined : process.env.PAYPAL_WEBHOOK_ID);
        try {
          const verifyResult = await adapter.processWebhook(headers, rawBody, secret, creds);
          if (verifyResult.processed) {
            matchingWorkspaces.push(conn.workspace_id);
          }
        } catch {
          // continue
        }
      }

      if (matchingWorkspaces.length === 1) {
        return { workspaceId: matchingWorkspaces[0], source: 'signature_match' };
      } else if (matchingWorkspaces.length > 1) {
        return { workspaceId: null, source: 'unresolved' };
      }
    }
  }

  // 4. Provider Account ID candidate matching (MUST be cryptographically verified in production)
  const incomingAccountId =
    payload?.account ||
    payload?.account_id ||
    payload?.data?.object?.account;

  if (incomingAccountId && connections.length > 0) {
    const matchedConns = connections.filter(
      (c: any) => c.metadata?.account_id === incomingAccountId || c.id === incomingAccountId
    );
    if (matchedConns.length === 1) {
      if (!isProduction) {
        return {
          workspaceId: matchedConns[0].workspace_id,
          accountId: incomingAccountId,
          source: 'account_id_match',
        };
      }
      // In production mode, account_id match alone is unverified and CANNOT establish workspace authorization.
      // Signature verification in Step 3 is mandatory for production authorization.
    }
  }

  // In production mode, NEVER trust unverified client headers, payload hints, or single tenant fallback
  if (isProduction) {
    return { workspaceId: null, source: 'unresolved' };
  }

  const headerWs = headers['x-workspace-id'];
  if (headerWs && typeof headerWs === 'string') {
    return { workspaceId: headerWs, source: 'explicit_header' };
  }

  if (connections.length === 1) {
    return { workspaceId: connections[0].workspace_id, source: 'single_tenant_fallback' };
  }

  return { workspaceId: null, source: 'unresolved' };
}
