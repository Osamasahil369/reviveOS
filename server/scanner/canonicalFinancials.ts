import {
  PaymentFailure,
  Invoice,
  FailureCategory,
} from '../../src/types/index.js';

export interface ScannerCurrencyTotal {
  totalAtRiskCents: number;
  totalRecoverableRevenueCents: number;
  expansionOpportunityCents: number;
}

export interface CanonicalLeak {
  key: string;
  invoiceId?: string;
  paymentFailureId?: string;
  customerId: string;
  amountCents: number;
  currency: string;
  isRecoverable: boolean;
  failureCategory: FailureCategory;
  recommendedAction: string;
  source: 'payment_failure' | 'unpaid_invoice';
  invoice?: Invoice;
  paymentFailure?: PaymentFailure;
}

export interface CanonicalFinancials {
  canonicalLeaks: CanonicalLeak[];
  totalAtRiskCents: number;
  totalRecoverableRevenueCents: number;
  totalsByCurrency: Record<string, ScannerCurrencyTotal>;
  primaryCurrency: string;
}

/**
 * Authoritative canonical financial exposure calculation.
 * Derives confirmed Revenue At Risk directly from underlying payment failures and invoices.
 * Guarantees:
 * - payment failure + same invoice counted once
 * - multiple payment failures on same invoice counted once
 * - existing opportunities do not increase financial exposure
 * - repeated failures do not duplicate financial exposure
 * - churn risk does not inflate confirmed Revenue At Risk
 * - expansion is separate upside
 * - currency totals are never blended
 */
export function calculateCanonicalFinancials(params: {
  paymentFailures: PaymentFailure[];
  invoices: Invoice[];
  defaultCurrency?: string;
  categoryFilter?: string;
}): CanonicalFinancials {
  const { paymentFailures, invoices, defaultCurrency = 'USD', categoryFilter } = params;
  const canonicalLeaksMap = new Map<string, CanonicalLeak>();

  // 1. Process payment failures
  for (const pf of paymentFailures) {
    if (typeof pf.amount_cents !== 'number' || isNaN(pf.amount_cents) || pf.amount_cents <= 0) {
      continue;
    }
    if (!pf.customer_id) continue;

    // Exclude resolved payment failures from current Revenue At Risk
    if (pf.is_resolved) continue;

    const failureCat: FailureCategory = pf.normalized_category || 'payment_method_declined';
    if (categoryFilter && categoryFilter !== 'all' && failureCat !== categoryFilter) {
      continue;
    }

    const linkedInvoice = invoices.find(
      (i) => i.id === pf.invoice_id || (i.provider_invoice_id && i.provider_invoice_id === pf.invoice_id)
    );

    // If linked invoice is paid or void, there is no current financial exposure
    if (linkedInvoice && (linkedInvoice.status === 'paid' || linkedInvoice.status === 'void')) {
      continue;
    }

    const isRecoverable = [
      'insufficient_funds',
      'payment_method_declined',
      'expired_card',
      'authentication_required',
      'temporary_provider_failure',
      'bank_related_failure',
      'other_recoverable_failure',
    ].includes(failureCat);

    const recommendedAction = failureCat === 'insufficient_funds' ? 'Smart Retry' : 'Customer Magic Link';

    if (linkedInvoice) {
      const canonicalKey = `invoice:${linkedInvoice.id || linkedInvoice.provider_invoice_id}`;
      if (canonicalLeaksMap.has(canonicalKey)) {
        const existing = canonicalLeaksMap.get(canonicalKey)!;
        if (!existing.paymentFailureId && pf.id) {
          existing.paymentFailureId = pf.id;
          existing.paymentFailure = pf;
        }
      } else {
        const authAmount =
          typeof linkedInvoice.amount_cents === 'number' && linkedInvoice.amount_cents > 0
            ? linkedInvoice.amount_cents
            : pf.amount_cents;

        canonicalLeaksMap.set(canonicalKey, {
          key: canonicalKey,
          invoiceId: linkedInvoice.id,
          paymentFailureId: pf.id,
          customerId: pf.customer_id,
          amountCents: authAmount,
          currency: linkedInvoice.currency || pf.currency || defaultCurrency,
          isRecoverable,
          failureCategory: failureCat,
          recommendedAction,
          source: 'payment_failure',
          invoice: linkedInvoice,
          paymentFailure: pf,
        });
      }
    } else {
      const canonicalKey = `payment_failure:${pf.id}`;
      if (!canonicalLeaksMap.has(canonicalKey)) {
        canonicalLeaksMap.set(canonicalKey, {
          key: canonicalKey,
          paymentFailureId: pf.id,
          customerId: pf.customer_id,
          amountCents: pf.amount_cents,
          currency: pf.currency || defaultCurrency,
          isRecoverable,
          failureCategory: failureCat,
          recommendedAction,
          source: 'payment_failure',
          paymentFailure: pf,
        });
      }
    }
  }

  // 2. Process unpaid / overdue invoices
  for (const inv of invoices) {
    const isUnpaid = inv.status === 'open' || inv.status === 'past_due' || inv.status === 'uncollectible';
    if (!isUnpaid) continue;
    if (typeof inv.amount_cents !== 'number' || isNaN(inv.amount_cents) || inv.amount_cents <= 0) {
      continue;
    }
    if (!inv.customer_id) continue;

    const failureCat: FailureCategory = 'payment_method_declined';
    if (categoryFilter && categoryFilter !== 'all' && failureCat !== categoryFilter) {
      continue;
    }

    const canonicalKey = `invoice:${inv.id || inv.provider_invoice_id}`;
    if (canonicalLeaksMap.has(canonicalKey)) {
      continue; // Already registered by linked payment failure; no double counting
    }

    canonicalLeaksMap.set(canonicalKey, {
      key: canonicalKey,
      invoiceId: inv.id,
      paymentFailureId: undefined,
      customerId: inv.customer_id,
      amountCents: inv.amount_cents,
      currency: inv.currency || defaultCurrency,
      isRecoverable: true,
      failureCategory: failureCat,
      recommendedAction: 'Direct Customer Follow-up & Ledger Settlement',
      source: 'unpaid_invoice',
      invoice: inv,
    });
  }

  // 3. Aggregate totals by currency
  const totalsByCurrency: Record<string, ScannerCurrencyTotal> = {};
  const canonicalLeaks = Array.from(canonicalLeaksMap.values());

  // Ensure defaultCurrency is always registered in totalsByCurrency
  totalsByCurrency[defaultCurrency] = {
    totalAtRiskCents: 0,
    totalRecoverableRevenueCents: 0,
    expansionOpportunityCents: 0,
  };

  canonicalLeaks.forEach((leak) => {
    const curr = leak.currency || defaultCurrency;
    if (!totalsByCurrency[curr]) {
      totalsByCurrency[curr] = {
        totalAtRiskCents: 0,
        totalRecoverableRevenueCents: 0,
        expansionOpportunityCents: 0,
      };
    }
    totalsByCurrency[curr].totalAtRiskCents += leak.amountCents;
    if (leak.isRecoverable) {
      totalsByCurrency[curr].totalRecoverableRevenueCents += leak.amountCents;
    }
  });

  // primaryCurrency MUST ALWAYS equal defaultCurrency (never substitute another currency)
  const primaryCurrency = defaultCurrency;
  const primaryTotals = totalsByCurrency[primaryCurrency] || {
    totalAtRiskCents: 0,
    totalRecoverableRevenueCents: 0,
    expansionOpportunityCents: 0,
  };

  return {
    canonicalLeaks,
    totalAtRiskCents: primaryTotals.totalAtRiskCents,
    totalRecoverableRevenueCents: primaryTotals.totalRecoverableRevenueCents,
    totalsByCurrency,
    primaryCurrency,
  };
}
