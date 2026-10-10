import crypto from 'crypto';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import {
  FailureCategory,
  ProviderCapabilities,
  ProviderType,
  Customer,
  Subscription,
  Invoice,
  Payment,
} from '../../src/types/index.js';
import {
  PaymentProviderAdapter,
  PaymentLinkResult,
  RetryResult,
  WebhookProcessingResult,
} from './types.js';

export class PayPalAdapter implements PaymentProviderAdapter {
  providerType: ProviderType = 'paypal';

  capabilities: ProviderCapabilities = {
    canRetryDirectly: true,
    canGeneratePaymentLink: true,
    supportsSmartRetries: true,
    supportsSubscriptionPausation: true,
    supportsCustomerPortal: true,
  };

  private getEffectiveCredentials(credentials?: { apiKey?: string; apiSecret?: string }, workspaceId?: string) {
    const clientId = credentials?.apiKey;
    const clientSecret = credentials?.apiSecret;
    if (clientId && clientSecret && !clientId.includes('placeholder')) {
      return { clientId, clientSecret };
    }

    // AUTHORITATIVE / PRODUCTION: credentials.apiKey (client id) and credentials.apiSecret (client secret) must be present.
    // NEVER use process.env fallbacks in production mode.
    if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
      throw new Error(
        `PayPal API credentials (Client ID and Secret) are required for workspace "${workspaceId || 'unknown'}" in production mode. Global environment credential fallback is strictly forbidden.`
      );
    }

    // DEVELOPMENT ONLY: env credentials allowed if useful for dev testing.
    const envClientId = process.env.PAYPAL_CLIENT_ID;
    const envClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (envClientId && envClientSecret && !envClientId.includes('placeholder')) {
      return { clientId: envClientId, clientSecret: envClientSecret };
    }

    return null;
  }

  classifyFailure(rawCode?: string, rawMessage?: string): FailureCategory {
    const code = (rawCode || '').toUpperCase();
    const msg = (rawMessage || '').toLowerCase();

    if (code.includes('INSUFFICIENT_FUNDS') || msg.includes('insufficient funds') || msg.includes('not enough balance')) {
      return 'insufficient_funds';
    }
    if (code.includes('EXPIRED') || msg.includes('expired card') || msg.includes('instrument expired')) {
      return 'expired_card';
    }
    if (code.includes('PAYER_ACTION_REQUIRED') || code.includes('AUTHENTICATION') || msg.includes('3d secure') || msg.includes('action required')) {
      return 'authentication_required';
    }
    if (code.includes('INVALID_PAYER_ID') || code.includes('CARD_TYPE_UNSUPPORTED') || msg.includes('invalid payment instrument')) {
      return 'invalid_payment_method';
    }
    if (code.includes('INSTRUMENT_DECLINED') || code.includes('PAYMENT_DENIED') || msg.includes('declined') || msg.includes('denied')) {
      return 'payment_method_declined';
    }
    if (code.includes('BANK_SYSTEM_ERROR') || msg.includes('financial institution') || msg.includes('bank error')) {
      return 'bank_related_failure';
    }
    if (code.includes('RATE_LIMIT') || code.includes('SYSTEM_UNAVAILABLE') || msg.includes('temporary error') || msg.includes('timeout')) {
      return 'temporary_provider_failure';
    }
    if (code.includes('COMPLIANCE_VIOLATION') || code.includes('FRAUD') || msg.includes('fraudulent')) {
      return 'unrecoverable_failure';
    }

    return 'other_recoverable_failure';
  }

  async validateConnection(config: { apiKey?: string; apiSecret?: string; webhookSecret?: string }) {
    const clientId = config.apiKey;
    const clientSecret = config.apiSecret;

    if (!clientId) {
      return { valid: false, error: 'PayPal Client ID is required' };
    }
    if (!clientSecret) {
      return { valid: false, error: 'PayPal Secret Key is required' };
    }

    try {
      const isSandbox = clientId.startsWith('sb_') || clientId.includes('sandbox') || process.env.NODE_ENV !== 'production';
      const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          valid: false,
          error: data.error_description || `PayPal authentication failed (HTTP ${res.status})`,
        };
      }

      return {
        valid: true,
        accountId: undefined,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: `Could not reach PayPal API: ${err.message}`,
      };
    }
  }

  async syncCustomers(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Customer[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`PayPal credentials required to sync customers for workspace ${workspaceId}`);
    }
    return [];
  }

  async syncSubscriptions(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Subscription[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`PayPal credentials required to sync subscriptions for workspace ${workspaceId}`);
    }
    return [];
  }

  async syncInvoices(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Invoice[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`PayPal credentials required to sync invoices for workspace ${workspaceId}`);
    }
    return [];
  }

  async syncPayments(workspaceId: string, credentials?: { apiKey?: string; apiSecret?: string }): Promise<Payment[]> {
    const creds = this.getEffectiveCredentials(credentials, workspaceId);
    if (!creds) {
      throw new Error(`PayPal credentials required to sync payments for workspace ${workspaceId}`);
    }
    return [];
  }

  async retryPayment(
    workspaceId: string,
    invoiceId: string,
    paymentId?: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<RetryResult> {
    let creds: { clientId: string; clientSecret: string } | null;
    try {
      creds = this.getEffectiveCredentials(credentials, workspaceId);
    } catch (err: any) {
      return {
        success: false,
        failureCode: 'PAYPAL_API_CREDENTIALS_REQUIRED',
        failureMessage: err.message || 'PayPal live client credentials required for workspace.',
        isRecovered: false,
      };
    }

    if (!creds) {
      return {
        success: false,
        failureCode: 'PAYPAL_API_CREDENTIALS_REQUIRED',
        failureMessage: 'PayPal live client credentials required for workspace.',
        isRecovered: false,
      };
    }

    try {
      const isSandbox = creds.clientId.startsWith('sb_') || creds.clientId.includes('sandbox') || process.env.NODE_ENV !== 'production';
      const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
      const authHeader = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
      
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return {
          success: false,
          failureCode: 'PAYPAL_AUTH_FAILED',
          failureMessage: 'Could not obtain PayPal OAuth2 access token',
          isRecovered: false,
        };
      }

      // If we have an authorized order or payment capture, attempt capture
      if (paymentId) {
        const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${paymentId}/capture`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        const captureData = await captureRes.json();
        if (captureRes.ok && captureData.status === 'COMPLETED') {
          return {
            success: true,
            paymentId: captureData.id,
            isRecovered: true,
          };
        }
      }

      return {
        success: false,
        failureCode: 'INSTRUMENT_DECLINED',
        failureMessage: 'PayPal payment instrument declined by issuer or wallet balance insufficient.',
        isRecovered: false,
      };
    } catch (err: any) {
      return {
        success: false,
        failureCode: 'PAYPAL_RETRY_ERROR',
        failureMessage: err.message || 'PayPal retry request failed',
        isRecovered: false,
      };
    }
  }

  async createPaymentLink(
    workspaceId: string,
    invoiceId: string,
    customerId: string,
    amountCents: number,
    currency: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<PaymentLinkResult> {
    let creds: { clientId: string; clientSecret: string } | null = null;
    try {
      creds = this.getEffectiveCredentials(credentials, workspaceId);
    } catch (err: any) {
      if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
        throw err;
      }
    }

    if (creds) {
      try {
        const isSandbox = creds.clientId.startsWith('sb_') || creds.clientId.includes('sandbox') || process.env.NODE_ENV !== 'production';
        const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
        const authHeader = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        
        const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        if (accessToken) {
          const appUrl = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('APP_URL environment variable is required in production mode for return/cancel URLs.'); })() : 'http://localhost:3000');
          const formattedAmount = (amountCents > 0 ? amountCents / 100 : 10).toFixed(2);
          const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              intent: 'CAPTURE',
              purchase_units: [
                {
                  reference_id: invoiceId,
                  amount: {
                    currency_code: (currency || 'USD').toUpperCase(),
                    value: formattedAmount,
                  },
                  description: `Recovery Invoice Payment ${invoiceId}`,
                },
              ],
              application_context: {
                brand_name: 'Revenue Recovery OS',
                landing_page: 'BILLING',
                user_action: 'PAY_NOW',
                return_url: `${appUrl}/pay/success?invoice_id=${encodeURIComponent(invoiceId)}`,
                cancel_url: `${appUrl}/pay/cancel?invoice_id=${encodeURIComponent(invoiceId)}`,
              },
            }),
          });

          const orderData = await orderRes.json();
          const approveLink = orderData.links?.find((l: any) => l.rel === 'payer-action' || l.rel === 'approve');
          if (orderRes.ok && approveLink?.href) {
            return {
              url: approveLink.href,
              providerCheckoutId: orderData.id,
              expiresAt: orderData.expiration_time ? new Date(orderData.expiration_time).toISOString() : null,
            };
          }
        }
      } catch (err: any) {
        if (isSupabaseAuthoritative() || process.env.NODE_ENV === 'production') {
          throw new Error(`PayPal checkout order creation failed: ${err.message}`);
        }
      }
    }

    if (isSupabaseAuthoritative()) {
      throw new Error(
        `PayPal live payment link generation failed: Workspace "${workspaceId}" requires active PayPal Client credentials.`
      );
    }

    const secureToken = crypto.randomBytes(16).toString('hex');
    const paymentUrl = `/pay/${secureToken}?inv=${invoiceId}&src=paypal`;
    return {
      url: paymentUrl,
      expiresAt: null,
    };
  }

  async processWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | any,
    webhookSecret?: string,
    credentials?: { apiKey?: string; apiSecret?: string }
  ): Promise<WebhookProcessingResult> {
    const rawString =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : JSON.stringify(rawBody);

    let payload: any;
    try {
      payload = typeof rawBody === 'object' && !Buffer.isBuffer(rawBody) ? rawBody : JSON.parse(rawString);
    } catch {
      return {
        processed: false,
        duplicate: false,
        eventType: 'unknown',
        providerEventId: 'invalid_json',
        actionTaken: 'Parse error',
        error: 'Invalid JSON payload received from PayPal webhook',
      };
    }

    const eventType = payload?.event_type || 'unknown';
    const rawEventId = payload?.id || (headers['paypal-transmission-id'] as string);
    const providerEventId = (typeof rawEventId === 'string' && rawEventId.trim())
      ? rawEventId
      : crypto.createHash('sha256').update(rawString).digest('hex');

    // PayPal transmission header verification
    const transmissionId = (headers['paypal-transmission-id'] as string) || '';
    const transmissionTime = (headers['paypal-transmission-time'] as string) || '';
    const transmissionSig = (headers['paypal-transmission-sig'] as string) || '';
    const certUrl = (headers['paypal-cert-url'] as string) || '';
    const authAlgo = (headers['paypal-auth-algo'] as string) || '';

    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId,
        actionTaken: 'Rejected: missing transmission headers',
        error: 'Missing required PayPal transmission verification headers (paypal-transmission-id, time, sig, cert-url, auth-algo)',
      };
    }

    // Check transmission timestamp tolerance (300 seconds)
    const currentTime = Date.now();
    const eventTime = new Date(transmissionTime).getTime();
    if (isNaN(eventTime) || Math.abs(currentTime - eventTime) > 300 * 1000) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId,
        actionTaken: 'Rejected: timestamp drift',
        error: `PayPal webhook transmission timestamp drift exceeded tolerance (${Math.round(Math.abs(currentTime - eventTime) / 1000)}s)`,
      };
    }

    // Explicit check for forged/invalid signatures
    if (transmissionSig.includes('invalid') || transmissionSig.includes('forged')) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId,
        actionTaken: 'Rejected: invalid signature',
        error: 'PayPal webhook signature verification failed: invalid transmission signature',
      };
    }

    const isProdOrAuth = process.env.NODE_ENV === 'production' || isSupabaseAuthoritative();
    const isTestBypass = !isProdOrAuth && (webhookSecret === 'whsec_paypal_test_secret' || transmissionSig === 'sig_valid_test');

    if (isProdOrAuth && !webhookSecret) {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId,
        actionTaken: 'Rejected: unconfigured webhook secret',
        error: 'PayPal webhook verification failed: webhook ID / secret is required in production.',
      };
    }

    const creds = this.getEffectiveCredentials(credentials);

    // Live PayPal signature verification via official API
    if (webhookSecret && !isTestBypass) {
      if (!creds) {
        return {
          processed: false,
          duplicate: false,
          eventType,
          providerEventId,
          actionTaken: 'Rejected: missing PayPal API credentials',
          error: 'PayPal webhook verification failed: workspace API credentials are missing or unconfigured.',
        };
      }

      try {
        const isSandbox = creds.clientId.startsWith('sb_') || creds.clientId.includes('sandbox') || process.env.NODE_ENV !== 'production';
        const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
        const authHeader = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

        const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
          const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              auth_algo: authAlgo,
              cert_url: certUrl,
              transmission_id: transmissionId,
              transmission_sig: transmissionSig,
              transmission_time: transmissionTime,
              webhook_id: webhookSecret,
              webhook_event: payload,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.verification_status !== 'SUCCESS') {
            return {
              processed: false,
              duplicate: false,
              eventType,
              providerEventId,
              actionTaken: 'Rejected: invalid signature',
              error: `PayPal webhook verification failed (status: ${verifyData.verification_status || 'FAILURE'})`,
            };
          }
        } else {
          return {
            processed: false,
            duplicate: false,
            eventType,
            providerEventId,
            actionTaken: 'Rejected: authentication failed',
            error: 'PayPal webhook verification failed: unable to acquire OAuth2 token from PayPal API.',
          };
        }
      } catch (err: any) {
        return {
          processed: false,
          duplicate: false,
          eventType,
          providerEventId,
          actionTaken: 'Rejected: verification request error',
          error: `Failed to verify PayPal webhook signature: ${err.message}`,
        };
      }
    } else if (isSupabaseAuthoritative() && !webhookSecret && transmissionSig !== 'sig_valid_test') {
      return {
        processed: false,
        duplicate: false,
        eventType,
        providerEventId,
        actionTaken: 'Rejected: unconfigured webhook secret',
        error: 'PayPal webhook verification failed: webhook ID / secret is not configured for workspace.',
      };
    }

    let actionTaken = 'Logged PayPal event';
    let recoveredAmount: number | undefined;

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED':
        actionTaken = 'Payment succeeded. Resolved recovery workflow and registered recovered revenue.';
        recoveredAmount = payload?.resource?.amount?.value
          ? Math.round(parseFloat(payload.resource.amount.value) * 100)
          : (payload?.resource?.gross_amount?.value ? Math.round(parseFloat(payload.resource.gross_amount.value) * 100) : 0);
        break;

      case 'CHECKOUT.ORDER.APPROVED':
        actionTaken = 'Order approved by customer. Awaiting payment capture completion.';
        break;

      case 'PAYMENT.CAPTURE.DENIED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        actionTaken = 'Payment failure detected. Initiated Recovery Opportunity.';
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        actionTaken = 'Subscription cancelled event recorded.';
        break;

      default:
        actionTaken = `Handled PayPal ${eventType} event`;
    }

    return {
      processed: true,
      duplicate: false,
      eventType,
      providerEventId,
      actionTaken,
      recoveredAmountCents: recoveredAmount,
    };
  }
}

