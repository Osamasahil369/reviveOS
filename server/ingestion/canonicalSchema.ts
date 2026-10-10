import { FailureCategory } from '../../src/types/index.js';

/**
 * Universal Revenue Data Ingestion Framework - Canonical Revenue Schema
 * 
 * All sources (Payments, Ecommerce, Accounting, CRM, Files, Databases, Universal API)
 * normalize into these unified canonical entities so Recovery Scanner, Revenue Missions,
 * Recovery Autopilot, Email Recovery, and Revenue Brain operate with 100% uniformity.
 */

export interface CanonicalCustomer {
  id: string;
  externalId: string;
  source: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  currency: string;
  country?: string;
  status: 'active' | 'past_due' | 'churned' | 'healthy' | 'at_risk';
  lifetimeValueCents: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export type CanonicalBillingInterval =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'every_6_months'
  | 'yearly'
  | 'custom';

export interface CanonicalSubscription {
  id: string;
  externalId: string;
  customerId: string;
  source: string;
  planName: string;
  amountCents: number;
  currency: string;
  billingInterval: CanonicalBillingInterval;
  status: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'paused' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface CanonicalInvoice {
  id: string;
  externalId: string;
  customerId: string;
  subscriptionId?: string;
  source: string;
  invoiceNumber?: string;
  amountCents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'past_due' | 'uncollectible' | 'void';
  dueDate: string;
  paidAt?: string;
  hostedInvoiceUrl?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface CanonicalPayment {
  id: string;
  externalId: string;
  customerId: string;
  invoiceId?: string;
  source: string;
  amountCents: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  paymentMethodType?: string;
  paymentMethodLast4?: string;
  failureCode?: string;
  failureMessage?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface CanonicalPaymentFailure {
  id: string;
  externalId: string;
  customerId: string;
  paymentId?: string;
  invoiceId?: string;
  source: string;
  amountCents: number;
  currency: string;
  rawErrorCode: string;
  rawErrorMessage: string;
  normalizedCategory: FailureCategory;
  occurredAt: string;
  isResolved: boolean;
  metadata?: Record<string, any>;
}

export interface CanonicalBatch {
  source: string;
  batchId: string;
  ingestedAt: string;
  customers: CanonicalCustomer[];
  subscriptions: CanonicalSubscription[];
  invoices: CanonicalInvoice[];
  payments: CanonicalPayment[];
  paymentFailures: CanonicalPaymentFailure[];
  metadata?: Record<string, any>;
}

/**
 * Standard Failure Category Normalizer for all connectors
 */
export function normalizeFailureCategory(
  rawCode: string = '',
  rawMessage: string = ''
): FailureCategory {
  const text = `${rawCode} ${rawMessage}`.toLowerCase();

  if (
    text.includes('insufficient') ||
    text.includes('balance') ||
    text.includes('not enough') ||
    text.includes('nsf') ||
    text.includes('low_balance')
  ) {
    return 'insufficient_funds';
  }

  if (
    text.includes('expired') ||
    text.includes('expiration') ||
    text.includes('expiry') ||
    text.includes('card_expired')
  ) {
    return 'expired_card';
  }

  if (
    text.includes('authentication') ||
    text.includes('3ds') ||
    text.includes('3d_secure') ||
    text.includes('sca') ||
    text.includes('otp') ||
    text.includes('challenge') ||
    text.includes('auth_required')
  ) {
    return 'authentication_required';
  }

  if (
    text.includes('invalid_card') ||
    text.includes('invalid_number') ||
    text.includes('invalid_cvc') ||
    text.includes('cvv') ||
    text.includes('invalid_payment_method')
  ) {
    return 'invalid_payment_method';
  }

  if (
    text.includes('bank') ||
    text.includes('clearing') ||
    text.includes('ach') ||
    text.includes('nach') ||
    text.includes('routing') ||
    text.includes('mandate_inactive')
  ) {
    return 'bank_related_failure';
  }

  if (
    text.includes('timeout') ||
    text.includes('network') ||
    text.includes('gateway') ||
    text.includes('temporary') ||
    text.includes('server_error') ||
    text.includes('econn') ||
    text.includes('system_down')
  ) {
    return 'temporary_provider_failure';
  }

  if (
    text.includes('fraud') ||
    text.includes('lost') ||
    text.includes('stolen') ||
    text.includes('pickup') ||
    text.includes('do_not_honor') ||
    text.includes('restricted') ||
    text.includes('unrecoverable')
  ) {
    return 'unrecoverable_failure';
  }

  return 'other_recoverable_failure';
}
