import crypto from 'crypto';
import { supabaseService } from '../db/supabaseService.js';
import { PaymentProviderFactory } from '../providers/factory.js';
import { ProviderType, RecoveryOpportunity } from '../../src/types/index.js';

export interface ProcessedWebhookResult {
  processed: boolean;
  duplicate: boolean;
  eventType: string;
  providerEventId: string;
  workspaceId: string;
  actionTaken: string;
  opportunityId?: string;
  recoveredAmountCents?: number;
}

export async function processAuthoritativeWebhook(
  workspaceId: string,
  providerType: ProviderType,
  payload: any,
  rawHeaders: Record<string, string | string[] | undefined>,
  rawBody?: string
): Promise<ProcessedWebhookResult> {
  // Webhook Event Identity (Requirement 2):
  // If the webhook payload contains a genuine stable provider event ID: use it.
  // Otherwise create SHA-256(raw webhook body) as the idempotency key.
  // This hash/key is ONLY for webhook idempotency. NEVER use it as payment/invoice/order/customer ID!
  // Provider resource IDs (pay_*, plink_*, inv_*, order_*) must NEVER be used as webhook event IDs.
  const candidateEventId = payload?.event_id || (
    typeof payload?.id === 'string' &&
    !payload.id.startsWith('pay_') &&
    !payload.id.startsWith('plink_') &&
    !payload.id.startsWith('inv_') &&
    !payload.id.startsWith('order_') &&
    !payload.id.startsWith('cust_')
      ? payload.id
      : undefined
  );

  const eventId = candidateEventId
    ? candidateEventId
    : crypto.createHash('sha256').update(rawBody || (typeof payload === 'string' ? payload : JSON.stringify(payload))).digest('hex');

  const eventType = payload?.type || payload?.event || payload?.event_type || 'unknown';

  // 1. Webhook Lifecycle Initial State: 'processing'
  const webhookRecordResult = await supabaseService.recordWebhookEvent({
    workspace_id: workspaceId,
    provider_type: providerType,
    provider_event_id: eventId,
    event_type: eventType,
    status: 'processing',
    payload_summary: `${providerType.toUpperCase()} ${eventType}`,
    payload,
    headers: {
      'content-type': (rawHeaders['content-type'] as string) || 'application/json',
      'signature': (rawHeaders['stripe-signature'] || rawHeaders['x-razorpay-signature'] || rawHeaders['paypal-transmission-sig'] || '') as string,
    },
    actions_triggered: [`Received authentic ${providerType} webhook ${eventId}`],
  });

  if (webhookRecordResult.isDuplicate) {
    return {
      processed: true,
      duplicate: true,
      eventType,
      providerEventId: eventId,
      workspaceId,
      actionTaken: `Duplicate event ${eventId} ignored (idempotency enforced)`,
    };
  }

  const webhookEventDbId = webhookRecordResult.record.id;

  try {
    const adapter = PaymentProviderFactory.getAdapter(providerType);
    let result: ProcessedWebhookResult;

    // =========================================================================
    // STRIPE PAYMENT FAILURE: invoice.payment_failed
    // =========================================================================
    if (providerType === 'stripe' && eventType === 'invoice.payment_failed') {
      const invObj = payload?.data?.object;
      const providerInvoiceId = invObj?.id;
      if (!providerInvoiceId) {
        throw new Error('Stripe invoice.payment_failed event missing provider invoice ID.');
      }
      const providerCustomerId = invObj?.customer;
      const customerEmail = invObj?.customer_email;
      const amountDue = Number(invObj?.amount_due || 0);
      const currency = (invObj?.currency || 'USD').toUpperCase();
      const declineCode = invObj?.last_payment_error?.decline_code || invObj?.last_payment_error?.code || 'card_declined';
      const declineMessage = invObj?.last_payment_error?.message || 'Invoice payment failed on Stripe';

      let customer: any = null;
      if (providerCustomerId) {
        customer = await supabaseService.getCustomerByProviderId(workspaceId, 'stripe', providerCustomerId);
      }
      if (!customer && customerEmail) {
        customer = await supabaseService.getCustomerByEmail(workspaceId, customerEmail);
      }
      if (!customer) {
        if (!customerEmail) {
          throw new Error(`Customer resolution failed for Stripe failure: missing email and no existing customer with provider_customer_id ${providerCustomerId}`);
        }
        const customerName = invObj?.customer_name || customerEmail.split('@')[0];
        customer = await supabaseService.createCustomer(workspaceId, {
          name: customerName,
          email: customerEmail,
          currency,
          country: 'US',
          provider_type: 'stripe',
          provider_customer_id: providerCustomerId,
          current_risk_status: 'at_risk',
          lifetime_value_cents: amountDue * 3,
          total_recovered_cents: 0,
        });
      }

      const invoice = await supabaseService.upsertInvoice(workspaceId, {
        customer_id: customer.id,
        provider_type: 'stripe',
        provider_invoice_id: providerInvoiceId,
        amount_due_cents: amountDue,
        currency,
        status: 'open',
        due_date: new Date().toISOString(),
        billing_reason: 'subscription_cycle',
        attempt_count: invObj?.attempt_count || 1,
      });

      const failureCategory = adapter.classifyFailure(declineCode, declineMessage);

      const paymentFailure = await supabaseService.recordPaymentFailure(workspaceId, {
        invoice_id: invoice.id,
        customer_id: customer.id,
        amount_cents: amountDue,
        currency,
        error_code: declineCode,
        decline_reason: declineMessage,
        failure_category: failureCategory,
        raw_payload: invObj,
      });

      const opportunity = await supabaseService.createRecoveryOpportunity(workspaceId, {
        customer_id: customer.id,
        payment_failure_id: paymentFailure.id,
        amount_at_risk_cents: amountDue,
        currency,
        status: 'new',
      });

      const campaigns = await supabaseService.getRecoveryCampaigns(workspaceId);
      const activeCampaign = campaigns.find((c: any) => c.is_active);
      const firstStep = activeCampaign?.steps?.[0];
      const channel = firstStep?.action_type === 'send_sms' ? 'sms' : 'email';

      await supabaseService.recordRecoveryEvent(workspaceId, {
        opportunity_id: opportunity.id,
        event_type: 'workflow_triggered',
        channel: channel as any,
        status: 'success',
        details: {
          campaign_name: activeCampaign?.name || 'Default Smart Dunning Campaign',
          step_number: 1,
          failure_category: failureCategory,
          scheduled_for: new Date().toISOString(),
        },
      });

      await supabaseService.recordCustomerTimelineEvent(workspaceId, {
        customer_id: customer.id,
        event_type: 'payment_failed',
        title: 'Payment Failed (Stripe Webhook)',
        description: `Invoice ${providerInvoiceId} payment of ${currency} ${(amountDue / 100).toFixed(2)} failed: ${declineMessage}`,
        actor: 'Stripe Webhook Pipeline',
      });

      await supabaseService.recordAuditLog(workspaceId, {
        action: 'PAYMENT_FAILURE_PROCESSED',
        resource_type: 'recovery_opportunity',
        resource_id: opportunity.id,
        metadata: {
          provider: 'stripe',
          invoice_id: providerInvoiceId,
          amount_due: amountDue,
          failure_category: failureCategory,
        },
      });

      result = {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        workspaceId,
        actionTaken: `Processed Stripe failure for invoice ${providerInvoiceId}. Created Recovery Opportunity ${opportunity.id}.`,
        opportunityId: opportunity.id,
      };
    }

    // =========================================================================
    // STRIPE PAYMENT SUCCESS: invoice.payment_succeeded / charge.succeeded / checkout.session.completed
    // =========================================================================
    else if (providerType === 'stripe' && (eventType === 'invoice.payment_succeeded' || eventType === 'charge.succeeded' || eventType === 'checkout.session.completed')) {
      const obj = payload?.data?.object;
      const amountPaid = Number(obj?.amount_paid || obj?.amount || obj?.amount_total || 0);
      const currency = (obj?.currency || 'USD').toUpperCase();

      if (!amountPaid || amountPaid <= 0 || !Number.isFinite(amountPaid)) {
        throw new Error(`Invalid or non-positive payment amount in Stripe webhook payload: ${amountPaid}`);
      }

      const opportunities = await supabaseService.getRecoveryOpportunities(workspaceId);
      let matchedOpp: any = undefined;
      let providerInvoiceId = '';

      if (eventType === 'checkout.session.completed') {
        const paymentStatus = obj?.payment_status;
        if (paymentStatus !== 'paid') {
          return {
            processed: true,
            duplicate: false,
            eventType,
            providerEventId: eventId,
            workspaceId,
            actionTaken: `Stripe checkout session ${obj?.id} completed with payment_status '${paymentStatus}'. Settlement skipped until payment is paid.`,
          };
        }
        const checkoutSessionId = obj?.id;
        const clientRefInvoiceId = obj?.client_reference_id || obj?.invoice;
        matchedOpp = opportunities.find(
          (opp) =>
            (checkoutSessionId && (opp as any).provider_checkout_id === checkoutSessionId) ||
            (clientRefInvoiceId && opp.invoice?.provider_invoice_id === clientRefInvoiceId)
        );
        providerInvoiceId = clientRefInvoiceId || matchedOpp?.invoice?.provider_invoice_id || checkoutSessionId || 'cs_checkout';
      } else if (eventType === 'invoice.payment_succeeded') {
        providerInvoiceId = obj?.id;
        matchedOpp = opportunities.find(
          (opp) => opp.invoice?.provider_invoice_id === providerInvoiceId
        );
      } else if (eventType === 'charge.succeeded') {
        providerInvoiceId = obj?.invoice;
        if (providerInvoiceId) {
          matchedOpp = opportunities.find(
            (opp) => opp.invoice?.provider_invoice_id === providerInvoiceId
          );
        }
      }

      if (matchedOpp && matchedOpp.status !== 'recovered') {
        if (matchedOpp.currency.toUpperCase() !== currency) {
          throw new Error(`Currency mismatch in Stripe settlement: Expected ${matchedOpp.currency}, got ${currency}`);
        }
        if (amountPaid !== matchedOpp.amount_at_risk_cents) {
          throw new Error(`Exact amount match required in Stripe settlement: Expected ${matchedOpp.amount_at_risk_cents}, got ${amountPaid}.`);
        }

        let providerPaymentId = obj?.payment_intent;
        if (eventType === 'checkout.session.completed') {
          if (!providerPaymentId || typeof providerPaymentId !== 'string' || !providerPaymentId.startsWith('pi_')) {
            throw new Error(`Stripe checkout.session.completed event missing authentic payment_intent ID (got: ${providerPaymentId}).`);
          }
        } else {
          providerPaymentId = obj?.payment_intent || obj?.charge || obj?.id;
        }

        if (!providerPaymentId || typeof providerPaymentId !== 'string' || providerPaymentId.startsWith('fake_') || providerPaymentId.startsWith('sandbox_') || providerPaymentId.startsWith('py_ret_') || providerPaymentId.startsWith('sim_') || providerPaymentId.startsWith('cs_') || providerPaymentId.startsWith('evt_')) {
          throw new Error(`Stripe payment succeeded event missing valid authentic payment ID: ${providerPaymentId}`);
        }

        await supabaseService.settleRecoveryPayment(workspaceId, matchedOpp.id, {
          amountCents: amountPaid,
          providerPaymentId,
          method: 'stripe_webhook_confirmation',
        });

        await supabaseService.recordAuditLog(workspaceId, {
          action: 'PAYMENT_RECOVERY_SETTLED',
          resource_type: 'recovery_opportunity',
          resource_id: matchedOpp.id,
          metadata: {
            provider: 'stripe',
            invoice_id: providerInvoiceId,
            amount_paid: amountPaid,
            settled_at: new Date().toISOString(),
          },
        });

        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `Stripe payment ${providerInvoiceId} confirmed. Settled opportunity ${matchedOpp.id}.`,
          opportunityId: matchedOpp.id,
          recoveredAmountCents: amountPaid,
        };
      } else {
        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `Stripe payment succeeded for invoice ${providerInvoiceId} (no pending opportunity matched).`,
        };
      }
    }

    // =========================================================================
    // RAZORPAY PAYMENT FAILURE: payment.failed / invoice.failed
    // =========================================================================
    else if (providerType === 'razorpay' && (eventType === 'payment.failed' || eventType === 'invoice.failed')) {
      const paymentEntity = payload?.payload?.payment?.entity || payload?.payment?.entity || payload;
      const providerPaymentId = paymentEntity?.id;
      const providerInvoiceId = paymentEntity?.invoice_id || paymentEntity?.order_id || paymentEntity?.payment_link_id;
      if (!providerInvoiceId) {
        throw new Error('Reconciliation required: Razorpay payment failure event missing exact invoice or order reference.');
      }
      if (!providerPaymentId) {
        throw new Error('Razorpay payment failure event missing authentic payment ID.');
      }
      const rzpCustomerId = paymentEntity?.customer_id;
      const customerEmail = paymentEntity?.email;
      const amount = Number(paymentEntity?.amount || 0);
      const currency = (paymentEntity?.currency || 'INR').toUpperCase();
      const errorCode = paymentEntity?.error_code || 'BAD_REQUEST_ERROR';
      const errorDescription = paymentEntity?.error_description || 'Razorpay payment attempt declined';

      let customer: any = null;
      if (rzpCustomerId) {
        customer = await supabaseService.getCustomerByProviderId(workspaceId, 'razorpay', rzpCustomerId);
      }
      if (!customer && customerEmail) {
        customer = await supabaseService.getCustomerByEmail(workspaceId, customerEmail);
      }
      if (!customer) {
        if (!customerEmail) {
          throw new Error(`Customer resolution failed for Razorpay failure: missing email and no customer with provider_customer_id ${rzpCustomerId}`);
        }
        const customerName = paymentEntity?.contact || customerEmail.split('@')[0];
        customer = await supabaseService.createCustomer(workspaceId, {
          name: customerName,
          email: customerEmail,
          currency,
          country: 'IN',
          provider_type: 'razorpay',
          provider_customer_id: rzpCustomerId || customerEmail,
          current_risk_status: 'at_risk',
          lifetime_value_cents: amount * 3,
          total_recovered_cents: 0,
        });
      }

      const invoice = await supabaseService.upsertInvoice(workspaceId, {
        customer_id: customer.id,
        provider_type: 'razorpay',
        provider_invoice_id: providerInvoiceId,
        amount_due_cents: amount,
        currency,
        status: 'open',
        due_date: new Date().toISOString(),
        billing_reason: 'subscription_cycle',
        attempt_count: 1,
      });

      const failureCategory = adapter.classifyFailure(errorCode, errorDescription);

      const paymentFailure = await supabaseService.recordPaymentFailure(workspaceId, {
        invoice_id: invoice.id,
        customer_id: customer.id,
        amount_cents: amount,
        currency,
        provider_type: 'razorpay',
        error_code: errorCode,
        decline_reason: errorDescription,
        failure_category: failureCategory,
        raw_payload: paymentEntity,
      });

      const opportunity = await supabaseService.createRecoveryOpportunity(workspaceId, {
        customer_id: customer.id,
        payment_failure_id: paymentFailure.id,
        amount_at_risk_cents: amount,
        currency,
        status: 'new',
      });

      await supabaseService.recordRecoveryEvent(workspaceId, {
        opportunity_id: opportunity.id,
        event_type: 'workflow_triggered',
        channel: 'email',
        status: 'success',
        details: {
          provider: 'razorpay',
          failure_code: errorCode,
          description: errorDescription,
          failure_category: failureCategory,
        },
      });

      await supabaseService.recordAuditLog(workspaceId, {
        action: 'PAYMENT_FAILURE_PROCESSED',
        resource_type: 'recovery_opportunity',
        resource_id: opportunity.id,
        metadata: { provider: 'razorpay', payment_id: providerPaymentId, error_code: errorCode },
      });

      result = {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        workspaceId,
        actionTaken: `Processed Razorpay payment failure ${providerPaymentId}. Created Recovery Opportunity ${opportunity.id}.`,
        opportunityId: opportunity.id,
      };
    }

    // =========================================================================
    // RAZORPAY PAYMENT SUCCESS: payment.captured / payment_link.paid / order.paid / invoice.paid
    // =========================================================================
    else if (
      providerType === 'razorpay' &&
      (eventType === 'payment.captured' || eventType === 'payment_link.paid' || eventType === 'order.paid' || eventType === 'invoice.paid')
    ) {
      const paymentEntity = payload?.payload?.payment?.entity || payload?.payment?.entity || {};
      const paymentLinkEntity = payload?.payload?.payment_link?.entity || payload?.payment_link?.entity || {};
      const providerCheckoutId = paymentLinkEntity?.id || paymentEntity?.payment_link_id;
      const providerPaymentId = paymentEntity?.id || (payload?.id && typeof payload.id === 'string' && payload.id.startsWith('pay_') ? payload.id : undefined);
      const providerInvoiceId = paymentEntity?.invoice_id || paymentEntity?.order_id || paymentLinkEntity?.invoice_id || paymentLinkEntity?.reference_id;
      const amountPaid = Number(paymentEntity?.amount || paymentLinkEntity?.amount || 0);
      const currency = (paymentEntity?.currency || paymentLinkEntity?.currency || 'INR').toUpperCase();

      if (!amountPaid || amountPaid <= 0 || !Number.isFinite(amountPaid)) {
        throw new Error(`Invalid or non-positive payment amount in Razorpay webhook: ${amountPaid}`);
      }

      // Exact resource lookup (Requirement 3): do not load all opportunities into memory
      let matchedOpp: RecoveryOpportunity | null = null;
      if (providerCheckoutId) {
        matchedOpp = await supabaseService.getRecoveryOpportunityByProviderCheckoutId(
          workspaceId,
          'razorpay',
          providerCheckoutId
        );
      }
      if (!matchedOpp && providerInvoiceId) {
        matchedOpp = await supabaseService.getRecoveryOpportunityByProviderInvoiceId(
          workspaceId,
          providerInvoiceId,
          'razorpay'
        );
      }

      // If exact opportunity cannot be established: record reconciliation-required state. Do NOT settle.
      if (!matchedOpp) {
        await supabaseService.recordAuditLog(workspaceId, {
          action: 'RECONCILIATION_REQUIRED',
          resource_type: 'payment',
          resource_id: providerPaymentId || eventId,
          metadata: {
            provider: 'razorpay',
            event_type: eventType,
            payment_id: providerPaymentId,
            payment_link_id: providerCheckoutId,
            invoice_id: providerInvoiceId,
            amount: amountPaid,
            currency,
            reason: 'No matching recovery opportunity established for Razorpay payment event. Settlement blocked.',
          },
        });

        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `Razorpay payment ${providerPaymentId || 'unknown'} requires reconciliation: no active recovery opportunity matched checkout (${providerCheckoutId}) or invoice (${providerInvoiceId}). Settlement blocked.`,
        };
        return result;
      }

      // Verify workspace isolation
      if (matchedOpp.workspace_id !== workspaceId) {
        throw new Error(`Tenant boundary violation: Opportunity ${matchedOpp.id} belongs to ${matchedOpp.workspace_id}, not ${workspaceId}`);
      }

      // Verify amount
      if (amountPaid !== matchedOpp.amount_at_risk_cents) {
        throw new Error(`Exact amount match required in Razorpay settlement: Expected ${matchedOpp.amount_at_risk_cents}, got ${amountPaid}.`);
      }

      // Verify currency
      if (matchedOpp.currency.toUpperCase() !== currency) {
        throw new Error(`Currency mismatch in Razorpay settlement: Expected ${matchedOpp.currency}, got ${currency}`);
      }

      // Verify invoice relationship
      if (providerInvoiceId && matchedOpp.invoice?.provider_invoice_id && matchedOpp.invoice.provider_invoice_id !== providerInvoiceId) {
        throw new Error(`Invoice relationship mismatch in Razorpay settlement: Expected ${matchedOpp.invoice.provider_invoice_id}, got ${providerInvoiceId}`);
      }

      // Require real Razorpay payment ID (reject fake_, sandbox_, py_ret_, sim_, etc.)
      if (
        !providerPaymentId ||
        typeof providerPaymentId !== 'string' ||
        providerPaymentId.startsWith('fake_') ||
        providerPaymentId.startsWith('sandbox_') ||
        providerPaymentId.startsWith('py_ret_') ||
        providerPaymentId.startsWith('sim_') ||
        !providerPaymentId.startsWith('pay_')
      ) {
        throw new Error(`Razorpay payment success event missing valid authentic payment ID (must start with 'pay_'): ${providerPaymentId}`);
      }

      if (matchedOpp.status !== 'recovered') {
        // Call canonical settlement RPC
        await supabaseService.settleRecoveryPayment(workspaceId, matchedOpp.id, {
          amountCents: amountPaid,
          providerPaymentId,
          method: 'razorpay_webhook_confirmation',
        });

        await supabaseService.recordAuditLog(workspaceId, {
          action: 'PAYMENT_RECOVERY_SETTLED',
          resource_type: 'recovery_opportunity',
          resource_id: matchedOpp.id,
          metadata: {
            provider: 'razorpay',
            payment_id: providerPaymentId,
            payment_link_id: providerCheckoutId,
            amount_paid: amountPaid,
            title: 'Razorpay Payment Settled',
          },
        });

        // Human-readable timeline entry (Requirement 8)
        await supabaseService.recordRecoveryEvent(workspaceId, {
          opportunity_id: matchedOpp.id,
          event_type: 'payment_settled',
          channel: 'gateway',
          status: 'success',
          details: {
            title: `Razorpay Payment Settled`,
            provider_payment_id: providerPaymentId,
            provider_checkout_id: providerCheckoutId,
            amount_cents: amountPaid,
            currency,
            webhook_event_type: eventType,
          },
        });

        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `Razorpay Payment Settled: payment ${providerPaymentId} (Link: ${providerCheckoutId || 'direct'}) confirmed. Settled recovery opportunity ${matchedOpp.id}.`,
          opportunityId: matchedOpp.id,
          recoveredAmountCents: amountPaid,
        };
      } else {
        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `Razorpay payment ${providerPaymentId} received for already recovered opportunity ${matchedOpp.id}.`,
          opportunityId: matchedOpp.id,
          recoveredAmountCents: amountPaid,
        };
      }
    }

    // =========================================================================
    // PAYPAL PAYMENT FAILURE: PAYMENT.CAPTURE.DENIED / BILLING.SUBSCRIPTION.PAYMENT.FAILED
    // =========================================================================
    else if (
      providerType === 'paypal' &&
      (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED')
    ) {
      const resource = payload?.resource || {};
      const providerPaymentId = resource.id || eventId;
      const providerInvoiceId = resource.custom_id || resource.invoice_id || providerPaymentId;
      const paypalCustomerId = resource.payer?.payer_id || resource.subscriber?.payer_id;
      const payerEmail = resource.payer?.email_address || resource.subscriber?.email_address;

      let rawAmount = resource.amount?.value || resource.gross_amount?.value || '0';
      const amountCents = Math.round(parseFloat(rawAmount) * 100);
      const currency = (resource.amount?.currency_code || resource.gross_amount?.currency_code || 'USD').toUpperCase();
      const errorCode = resource.status || 'PAYMENT_DENIED';
      const errorMsg = resource.status_details?.reason || 'PayPal capture attempt was denied.';

      let customer: any = null;
      if (paypalCustomerId) {
        customer = await supabaseService.getCustomerByProviderId(workspaceId, 'paypal', paypalCustomerId);
      }
      if (!customer && payerEmail) {
        customer = await supabaseService.getCustomerByEmail(workspaceId, payerEmail);
      }
      if (!customer) {
        if (!payerEmail) {
          throw new Error(`Customer resolution failed for PayPal failure: missing email and no customer with provider_customer_id ${paypalCustomerId}`);
        }
        const payerName = resource.payer?.name?.given_name || payerEmail.split('@')[0];
        customer = await supabaseService.createCustomer(workspaceId, {
          name: payerName,
          email: payerEmail,
          currency,
          country: 'US',
          provider_type: 'paypal',
          provider_customer_id: paypalCustomerId || payerEmail,
          current_risk_status: 'at_risk',
          lifetime_value_cents: amountCents * 3,
          total_recovered_cents: 0,
        });
      }

      const invoice = await supabaseService.upsertInvoice(workspaceId, {
        customer_id: customer.id,
        provider_type: 'paypal',
        provider_invoice_id: providerInvoiceId,
        amount_due_cents: amountCents,
        currency,
        status: 'open',
        due_date: new Date().toISOString(),
        billing_reason: 'subscription_cycle',
        attempt_count: 1,
      });

      const failureCategory = adapter.classifyFailure(errorCode, errorMsg);

      const paymentFailure = await supabaseService.recordPaymentFailure(workspaceId, {
        invoice_id: invoice.id,
        customer_id: customer.id,
        amount_cents: amountCents,
        currency,
        provider_type: 'paypal',
        error_code: errorCode,
        decline_reason: errorMsg,
        failure_category: failureCategory,
        raw_payload: resource,
      });

      const opportunity = await supabaseService.createRecoveryOpportunity(workspaceId, {
        customer_id: customer.id,
        payment_failure_id: paymentFailure.id,
        amount_at_risk_cents: amountCents,
        currency,
        status: 'new',
      });

      await supabaseService.recordAuditLog(workspaceId, {
        action: 'PAYMENT_FAILURE_PROCESSED',
        resource_type: 'recovery_opportunity',
        resource_id: opportunity.id,
        metadata: { provider: 'paypal', payment_id: providerPaymentId, error_code: errorCode },
      });

      result = {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        workspaceId,
        actionTaken: `Processed PayPal capture failure ${providerPaymentId}. Created Recovery Opportunity ${opportunity.id}.`,
        opportunityId: opportunity.id,
      };
    }

    // =========================================================================
    // PAYPAL ORDER APPROVAL (NON-SETTLING INFORMATIONAL EVENT)
    // =========================================================================
    else if (providerType === 'paypal' && eventType === 'CHECKOUT.ORDER.APPROVED') {
      const resource = payload?.resource || {};
      const orderId = resource.id || 'order_unknown';
      result = {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        workspaceId,
        actionTaken: `PayPal order ${orderId} approved by payer. Awaiting PAYMENT.CAPTURE.COMPLETED for financial settlement.`,
      };
    }

    // =========================================================================
    // PAYPAL PAYMENT CAPTURE SUCCESS: PAYMENT.CAPTURE.COMPLETED / BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED
    // =========================================================================
    else if (
      providerType === 'paypal' &&
      (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED')
    ) {
      const resource = payload?.resource || {};
      const providerPaymentId = resource.id;
      if (!providerPaymentId || typeof providerPaymentId !== 'string') {
        throw new Error('PayPal capture success event missing authoritative capture ID.');
      }

      const providerInvoiceId =
        resource.custom_id ||
        resource.invoice_id ||
        resource.supplementary_data?.related_ids?.order_id ||
        providerPaymentId;

      let rawAmount = resource.amount?.value || resource.gross_amount?.value || resource.total?.value || '0';
      const capturedAmountCents = Math.round(parseFloat(rawAmount) * 100);
      const currency = (resource.amount?.currency_code || resource.gross_amount?.currency_code || 'USD').toUpperCase();

      if (!capturedAmountCents || capturedAmountCents <= 0 || !Number.isFinite(capturedAmountCents)) {
        throw new Error(`Invalid or non-positive payment amount in PayPal webhook: ${rawAmount}`);
      }

      const opportunities = await supabaseService.getRecoveryOpportunities(workspaceId);
      const matchedOpp = opportunities.find(
        (opp) =>
          opp.invoice?.provider_invoice_id === providerInvoiceId ||
          (opp as any).provider_checkout_id === providerInvoiceId
      );

      if (matchedOpp && matchedOpp.status !== 'recovered') {
        if (matchedOpp.currency.toUpperCase() !== currency) {
          throw new Error(`Currency mismatch in PayPal settlement: Expected ${matchedOpp.currency}, got ${currency}`);
        }
        if (capturedAmountCents !== matchedOpp.amount_at_risk_cents) {
          throw new Error(`Exact amount match required in PayPal settlement: Expected ${matchedOpp.amount_at_risk_cents}, got ${capturedAmountCents}.`);
        }

        if (!providerPaymentId || typeof providerPaymentId !== 'string' || providerPaymentId.startsWith('fake_') || providerPaymentId.startsWith('sandbox_') || providerPaymentId.startsWith('py_ret_') || providerPaymentId.startsWith('sim_')) {
          throw new Error(`PayPal payment success event missing valid authentic payment ID: ${providerPaymentId}`);
        }

        await supabaseService.settleRecoveryPayment(workspaceId, matchedOpp.id, {
          amountCents: capturedAmountCents,
          providerPaymentId,
          method: 'paypal_webhook_confirmation',
        });

        await supabaseService.recordAuditLog(workspaceId, {
          action: 'PAYMENT_RECOVERY_SETTLED',
          resource_type: 'recovery_opportunity',
          resource_id: matchedOpp.id,
          metadata: { provider: 'paypal', payment_id: providerPaymentId, amount_paid: capturedAmountCents },
        });

        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `PayPal payment ${providerPaymentId} confirmed. Settled recovery opportunity ${matchedOpp.id}.`,
          opportunityId: matchedOpp.id,
          recoveredAmountCents: capturedAmountCents,
        };
      } else {
        result = {
          processed: true,
          duplicate: false,
          eventType,
          providerEventId: eventId,
          workspaceId,
          actionTaken: `PayPal payment succeeded: ${providerPaymentId} (no pending opportunity matched).`,
        };
      }
    }

    // Default fallback for informational webhooks
    else {
      result = {
        processed: true,
        duplicate: false,
        eventType,
        providerEventId: eventId,
        workspaceId,
        actionTaken: `Recorded informational ${providerType} webhook: ${eventType}`,
      };
    }

    // Transition lifecycle: 'processing' -> 'processed'
    await supabaseService.updateWebhookEventStatus(webhookEventDbId, 'processed', {
      processing_result: result,
      actions_triggered: [result.actionTaken],
    });

    return result;
  } catch (err: any) {
    // Transition lifecycle: 'processing' -> 'failed'
    await supabaseService.updateWebhookEventStatus(webhookEventDbId, 'failed', {
      error_message: err.message,
      processing_result: { error: err.message },
      actions_triggered: [`Processing failed: ${err.message}`],
    });
    throw err;
  }
}
