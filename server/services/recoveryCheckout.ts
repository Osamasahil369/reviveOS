import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { getSupabaseServerClient } from '../db/supabaseClient.js';
import { supabaseService } from '../db/supabaseService.js';
import { db } from '../store/db.js';
import { PaymentProviderFactory } from '../providers/factory.js';
import { decryptSecret } from '../security/encryption.js';

export interface RecoveryCheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  expiresAt?: string;
  provider?: string;
  status: 'checkout_created' | 'already_recovered' | 'error';
  message?: string;
}

export function validateReturnUrl(returnUrl: string | undefined): string | null {
  if (!returnUrl || typeof returnUrl !== 'string') return null;
  const trimmed = returnUrl.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:') ||
    trimmed.toLowerCase().startsWith('vbscript:')
  ) {
    return null;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }

  let appUrl = process.env.APP_URL;
  if (!appUrl) {
    if (process.env.NODE_ENV === 'production' || isSupabaseAuthoritative()) {
      throw new Error('APP_URL environment variable is required in production mode.');
    }
    appUrl = 'http://localhost:3000';
  }

  try {
    const parsed = new URL(trimmed);
    const parsedAppUrl = new URL(appUrl.replace(/\/$/, ''));
    if (parsed.origin === parsedAppUrl.origin) {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Authoritative Server-Side Recovery Checkout Link Generation.
 * Never performs fake instant settlements.
 * Calls the designated payment provider to generate an authentic provider-hosted checkout session.
 */
export async function createRecoveryCheckout(
  token: string,
  returnUrl?: string
): Promise<RecoveryCheckoutResult> {
  if (!token || typeof token !== 'string') {
    return {
      success: false,
      status: 'error',
      message: 'A valid recovery token is required.',
    };
  }

  if (isSupabaseAuthoritative()) {
    const opp = await supabaseService.getRecoveryOpportunityByToken(token);
    if (!opp) {
      return {
        success: false,
        status: 'error',
        message: 'Recovery payment link is invalid or non-existent.',
      };
    }

    if ((opp as any).is_expired || ((opp as any).token_expires_at && new Date((opp as any).token_expires_at).getTime() < Date.now())) {
      return {
        success: false,
        status: 'error',
        message: 'Recovery payment link has expired.',
      };
    }

    if (opp.status === 'recovered') {
      return {
        success: true,
        status: 'already_recovered',
        message: 'Payment has already been successfully recovered.',
      };
    }

    if (opp.status === 'expired') {
      return {
        success: false,
        status: 'error',
        message: 'Recovery opportunity has expired.',
      };
    }

    if (opp.status === 'cancelled' || opp.status === 'not_recoverable') {
      return {
        success: false,
        status: 'error',
        message: 'Recovery opportunity is no longer active.',
      };
    }

    const wsId = opp.workspace_id;
    const providerType = (opp.payment_failure as any)?.provider_type || (opp.invoice as any)?.provider_type || (opp.customer as any)?.provider_type;

    if (!providerType) {
      return {
        success: false,
        status: 'error',
        message: 'Payment provider type could not be determined for this recovery opportunity.',
      };
    }

    // Idempotency / Reuse check: if an active non-expired provider checkout URL exists, reuse it
    if ((opp as any).checkout_url && (opp as any).checkout_status === 'checkout_initiated') {
      const expiresAtStr = (opp as any).checkout_expires_at;
      const isExpired = expiresAtStr ? new Date(expiresAtStr).getTime() < Date.now() : false;
      if (!isExpired) {
        return {
          success: true,
          checkoutUrl: (opp as any).checkout_url,
          expiresAt: expiresAtStr,
          provider: providerType,
          status: 'checkout_created',
        };
      }
    }

    const connections = await supabaseService.getProviderConnections(wsId);
    const connection = connections.find((c: any) => c.provider_type === providerType && c.status !== 'disconnected');

    if (!connection) {
      return {
        success: false,
        status: 'error',
        message: `Payment provider "${providerType}" is not configured for this workspace (NOT_CONFIGURED).`,
      };
    }

    const credentials = {
      apiKey: (connection as any).api_key_encrypted ? decryptSecret((connection as any).api_key_encrypted) : undefined,
      apiSecret: (connection as any).api_secret_encrypted ? decryptSecret((connection as any).api_secret_encrypted) : undefined,
      webhookSecret: (connection as any).webhook_secret_encrypted ? decryptSecret((connection as any).webhook_secret_encrypted) : undefined,
    };

    const adapter = PaymentProviderFactory.getAdapter(providerType);
    const invoiceId = (opp.invoice as any)?.provider_invoice_id || (opp as any).invoice_id;
    if (!invoiceId) {
      throw new Error(`Cannot generate checkout session for opportunity ${opp.id}: missing provider invoice ID.`);
    }
    const customerId = (opp.customer as any)?.provider_customer_id || opp.customer_id;
    const amountCents = opp.amount_at_risk_cents || (opp.invoice as any)?.amount_cents || 0;
    const currency = opp.currency || 'USD';

    try {
      const result = await adapter.createPaymentLink(
        wsId,
        invoiceId,
        customerId,
        amountCents,
        currency,
        credentials
      );

      const supabase = getSupabaseServerClient();
      if (supabase) {
        await supabase
          .from('recovery_opportunities')
          .update({
            provider_checkout_id: result.providerCheckoutId || null,
            checkout_url: result.url,
            checkout_expires_at: result.expiresAt || null,
            checkout_status: 'checkout_initiated',
            updated_at: new Date().toISOString(),
          })
          .eq('id', opp.id);

        await supabase.from('recovery_events').insert({
          workspace_id: wsId,
          opportunity_id: opp.id,
          event_type: 'checkout_session_created',
          channel: 'customer_portal',
          status: 'success',
          details: {
            provider_checkout_id: result.providerCheckoutId || null,
            checkout_url: result.url,
            provider: providerType,
            amount_cents: amountCents,
          },
          created_at: new Date().toISOString(),
        });
      }

      return {
        success: true,
        checkoutUrl: result.url,
        expiresAt: result.expiresAt,
        provider: providerType,
        status: 'checkout_created',
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'error',
        message: err.message || 'Failed to initiate secure checkout session with payment provider.',
      };
    }
  }

  // Development / In-memory storage mode
  const opp = db.getOpportunityByToken(token);
  if (!opp) {
    return {
      success: false,
      status: 'error',
      message: 'Recovery payment session not found.',
    };
  }

  if (opp.status === 'recovered') {
    return {
      success: true,
      status: 'already_recovered',
      message: 'Payment has already been successfully recovered.',
    };
  }

  const providerType = (opp as any).invoice?.provider_type || 'stripe';
  const adapter = PaymentProviderFactory.getAdapter(providerType);
  const invoiceId = (opp as any).invoice?.provider_invoice_id || (opp as any).invoice_id;
  if (!invoiceId) {
    throw new Error(`Cannot generate checkout link for opportunity ${opp.id}: missing invoice ID.`);
  }
  const result = await adapter.createPaymentLink(
    opp.workspace_id,
    invoiceId,
    opp.customer_id,
    opp.amount_at_risk_cents,
    opp.currency
  );

  opp.payment_link_url = result.url;

  return {
    success: true,
    checkoutUrl: result.url,
    expiresAt: result.expiresAt,
    provider: providerType,
    status: 'checkout_created',
  };
}

export async function createRazorpayRecoveryPaymentLink(opportunityId: string, workspaceId: string): Promise<{
  success: boolean;
  paymentLinkUrl?: string;
  providerCheckoutId?: string;
  expiresAt?: string;
  message?: string;
}> {
  let opp: any = null;
  if (isSupabaseAuthoritative()) {
    opp = await supabaseService.getRecoveryOpportunityById(workspaceId, opportunityId);
  } else {
    opp = db.getOpportunityById(opportunityId, workspaceId);
  }
  if (!opp || opp.workspace_id !== workspaceId) {
    throw new Error(`Opportunity ${opportunityId} not found in workspace ${workspaceId}.`);
  }

  let paymentFailure: any = null;
  if (isSupabaseAuthoritative()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.from('payment_failures').select('*').eq('id', opp.payment_failure_id).eq('workspace_id', workspaceId).maybeSingle();
      paymentFailure = data;
    }
  } else {
    paymentFailure = db.getPaymentFailures(workspaceId).find((f: any) => f.id === opp.payment_failure_id);
  }
  if (!paymentFailure || paymentFailure.workspace_id !== workspaceId) {
    throw new Error(`Exact payment_failure for opportunity ${opportunityId} not found.`);
  }

  let invoice: any = null;
  if (isSupabaseAuthoritative()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.from('invoices').select('*').eq('id', paymentFailure.invoice_id).eq('workspace_id', workspaceId).maybeSingle();
      invoice = data;
    }
  } else {
    invoice = db.getInvoices(workspaceId).find((i: any) => i.id === paymentFailure.invoice_id);
  }
  if (!invoice || invoice.workspace_id !== workspaceId) {
    throw new Error(`Exact invoice linked to payment_failure ${paymentFailure.id} not found.`);
  }

  let customer: any = null;
  if (isSupabaseAuthoritative()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.from('customers').select('*').eq('id', invoice.customer_id).eq('workspace_id', workspaceId).maybeSingle();
      customer = data;
    }
  } else {
    customer = db.getCustomerById(invoice.customer_id, workspaceId);
  }
  if (!customer || customer.workspace_id !== workspaceId) {
    throw new Error(`Exact customer linked to invoice ${invoice.id} not found.`);
  }

  if (
    invoice.customer_id !== paymentFailure.customer_id ||
    invoice.customer_id !== opp.customer_id ||
    paymentFailure.customer_id !== opp.customer_id
  ) {
    throw new Error(`Tenant isolation or customer relationship mismatch.`);
  }

  const amountCents = opp.amount_at_risk_cents || invoice.amount_cents;
  const currency = opp.currency || invoice.currency;
  if (!amountCents || amountCents <= 0 || !currency) {
    throw new Error(`Invalid amount or currency at risk for opportunity ${opportunityId}.`);
  }

  let credentials: any = null;
  if (isSupabaseAuthoritative()) {
    credentials = await supabaseService.getDecryptedProviderCredentials(workspaceId, 'razorpay');
  } else {
    const conn = db.getProviderConnection(workspaceId, 'razorpay');
    if (conn && conn.status !== 'disconnected') {
      credentials = {
        apiKey: (conn as any).api_key_encrypted ? decryptSecret((conn as any).api_key_encrypted) : undefined,
        apiSecret: (conn as any).api_secret_encrypted ? decryptSecret((conn as any).api_secret_encrypted) : undefined,
        webhookSecret: (conn as any).webhook_secret_encrypted ? decryptSecret((conn as any).webhook_secret_encrypted) : undefined,
      };
    }
  }

  if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
    if (!credentials || !credentials.apiKey || !credentials.apiSecret) {
      throw new Error(`Razorpay provider credentials are not configured for workspace ${workspaceId} (NOT_CONFIGURED).`);
    }
  }

  // Idempotency: check if active checkout exists
  if (opp.checkout_url && opp.checkout_status === 'checkout_initiated' && opp.checkout_expires_at) {
    if (new Date(opp.checkout_expires_at).getTime() > Date.now()) {
      return {
        success: true,
        paymentLinkUrl: opp.checkout_url,
        providerCheckoutId: opp.provider_checkout_id,
        expiresAt: opp.checkout_expires_at,
      };
    }
  }

  let appUrl = process.env.APP_URL;
  if (!appUrl && (process.env.NODE_ENV === 'production' || isSupabaseAuthoritative())) {
    throw new Error('APP_URL environment variable is required in production mode for payment link callback.');
  }
  appUrl = appUrl || 'http://localhost:3000';
  const callbackUrl = `${appUrl.replace(/\/$/, '')}/pay/callback?opp=${encodeURIComponent(opp.id)}&inv=${encodeURIComponent(invoice.id)}`;

  const adapter = PaymentProviderFactory.getAdapter('razorpay');
  const result = await adapter.createPaymentLink(
    workspaceId,
    invoice.provider_invoice_id || invoice.id,
    customer.provider_customer_id || customer.id,
    amountCents,
    currency,
    credentials
  );

  const expiresAt = result.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (isSupabaseAuthoritative()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      await supabase
        .from('recovery_opportunities')
        .update({
          provider_checkout_id: result.providerCheckoutId || null,
          checkout_url: result.url,
          checkout_expires_at: expiresAt,
          checkout_status: 'checkout_initiated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', opp.id);

      await supabase.from('recovery_events').insert({
        workspace_id: workspaceId,
        opportunity_id: opp.id,
        event_type: 'checkout_session_created',
        channel: 'customer_portal',
        status: 'success',
        details: {
          provider_checkout_id: result.providerCheckoutId || null,
          checkout_url: result.url,
          amount_cents: amountCents,
          currency,
        },
        created_at: new Date().toISOString(),
      });
    }
  } else {
    opp.provider_checkout_id = result.providerCheckoutId || null;
    opp.checkout_url = result.url;
    opp.checkout_expires_at = expiresAt;
    opp.checkout_status = 'checkout_initiated';
    opp.updated_at = new Date().toISOString();
  }

  return {
    success: true,
    paymentLinkUrl: result.url,
    providerCheckoutId: result.providerCheckoutId,
    expiresAt,
  };
}
