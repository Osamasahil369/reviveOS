import { db } from '../store/db.js';
import { Customer, RecoveryOpportunity, Subscription, PaymentFailure } from '../../src/types/index.js';

export type DeterministicHealthStatus = 'HEALTHY' | 'WATCH' | 'AT RISK' | 'CRITICAL';

export interface CustomerHealthProfile {
  customerId: string;
  customerName: string;
  customerEmail: string;
  workspaceId: string;
  currency: string;
  status: DeterministicHealthStatus;
  
  // Core Deterministic Indicators
  paymentReliabilityPercent: number; // 0 to 100% based on actual payment history
  failedPaymentFrequency: number; // Count of payment failures in past 90 days
  consecutiveFailures: number; // Current active unresolved failures
  subscriptionStability: 'stable' | 'expiring' | 'past_due' | 'cancelled' | 'none';
  usageTrend: 'increasing' | 'stable' | 'declining' | 'inactive';
  cancellationRisk: 'low' | 'moderate' | 'high' | 'imminent';
  expansionLikelihood: 'high' | 'moderate' | 'low' | 'unlikely';

  // Supporting Evidence Only (No fabricated AI fluff)
  evidence: string[];
  recommendedAction: string;
  revenueAtRiskCents: number;
  lifetimeValueCents: number;
  subscriptionPlanName?: string;
  updatedAt: string;
}

export class CustomerHealthEngine {
  /**
   * Deterministically evaluates the health status for a single customer.
   * Multi-tenant isolated: strictly filters records by workspaceId.
   */
  public static evaluateCustomer(workspaceId: string, customerId: string): CustomerHealthProfile | null {
    if (!workspaceId) throw new Error('workspaceId is required');
    if (!customerId) throw new Error('customerId is required');

    const customer = db.getCustomerById(customerId, workspaceId);
    if (!customer || customer.workspace_id !== workspaceId) {
      return null;
    }

    const subscriptions = db.getSubscriptions(workspaceId).filter((s) => s.customer_id === customerId);
    const invoices = db.getInvoices(workspaceId).filter((inv) => inv.customer_id === customerId);
    const opportunities = db.getOpportunities(workspaceId).filter((o) => o.customer_id === customerId);
    const timelineEvents = db.getCustomerTimeline(customerId, workspaceId);

    // 1. Payment Reliability calculation
    const paidInvoices = invoices.filter((i) => i.status === 'paid');
    const totalInvoices = invoices.length;
    const paymentReliabilityPercent = totalInvoices > 0
      ? Math.round((paidInvoices.length / totalInvoices) * 100)
      : 100;

    // 2. Failed Payment Frequency (past 90 days)
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const recentFailures = invoices.filter((inv) => {
      const invDate = new Date(inv.created_at).getTime();
      return invDate >= ninetyDaysAgo && (inv.status === 'past_due' || inv.status === 'uncollectible');
    });
    const failedPaymentFrequency = recentFailures.length;

    // 3. Consecutive & Active unresolved failures
    const activeUnresolvedOpps = opportunities.filter((o) => o.status !== 'recovered' && o.status !== 'cancelled');
    const consecutiveFailures = activeUnresolvedOpps.length;

    // 4. Subscription Stability
    const activeSub = subscriptions.find((s) => s.status === 'active' || s.status === 'trialing');
    const pastDueSub = subscriptions.find((s) => s.status === 'past_due');
    const cancelledSub = subscriptions.find((s) => s.status === 'canceled');

    let subscriptionStability: 'stable' | 'expiring' | 'past_due' | 'cancelled' | 'none' = 'none';
    if (pastDueSub) {
      subscriptionStability = 'past_due';
    } else if (activeSub) {
      subscriptionStability = 'stable';
    } else if (cancelledSub) {
      subscriptionStability = 'cancelled';
    }

    // Check payment method expiry if available
    const hasExpiringCard = timelineEvents.some(
      (e) => e.event_type === 'payment_failure' && (e.description?.toLowerCase().includes('expired') || e.gateway_response?.toLowerCase().includes('expired'))
    );
    if (activeSub && hasExpiringCard && subscriptionStability === 'stable') {
      subscriptionStability = 'expiring';
    }

    // 5. Usage Trend (derived from real timeline activity recency)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentEvents = timelineEvents.filter((e) => new Date(e.created_at).getTime() >= thirtyDaysAgo);
    let usageTrend: 'increasing' | 'stable' | 'declining' | 'inactive' = 'stable';
    if (timelineEvents.length === 0) {
      usageTrend = 'inactive';
    } else if (recentEvents.length >= 5) {
      usageTrend = 'increasing';
    } else if (recentEvents.length >= 1) {
      usageTrend = 'stable';
    } else {
      usageTrend = 'declining';
    }

    // 6. Evidence compilation
    const evidence: string[] = [];

    // Check dispute or fraud
    const hasActiveDispute = activeUnresolvedOpps.some((o) => o.has_active_dispute || o.is_fraud || o.is_chargeback);
    if (hasActiveDispute) {
      evidence.push('Active payment dispute or fraud flag on record');
    }

    if (consecutiveFailures > 0) {
      evidence.push(`${consecutiveFailures} active unresolved billing failure${consecutiveFailures > 1 ? 's' : ''}`);
    }

    if (failedPaymentFrequency > 0) {
      evidence.push(`${failedPaymentFrequency} payment decline${failedPaymentFrequency > 1 ? 's' : ''} in the past 90 days`);
    }

    if (hasExpiringCard) {
      evidence.push('Payment card expired or expiring on billing file');
    }

    if (paidInvoices.length > 0 && failedPaymentFrequency === 0) {
      evidence.push(`${paidInvoices.length} consecutive on-time payment clearances`);
    }

    if (activeSub) {
      const subAgeDays = Math.floor((Date.now() - new Date(activeSub.created_at).getTime()) / (24 * 60 * 60 * 1000));
      if (subAgeDays > 60) {
        evidence.push(`Active subscription maintained for ${subAgeDays} days`);
      }
    }

    // 7. Deterministic Classification
    let status: DeterministicHealthStatus = 'HEALTHY';
    let cancellationRisk: 'low' | 'moderate' | 'high' | 'imminent' = 'low';
    let expansionLikelihood: 'high' | 'moderate' | 'low' | 'unlikely' = 'low';
    let recommendedAction = 'Maintain standard automated monitoring';

    if (hasActiveDispute || consecutiveFailures >= 3 || subscriptionStability === 'cancelled') {
      status = 'CRITICAL';
      cancellationRisk = 'imminent';
      expansionLikelihood = 'unlikely';
      recommendedAction = hasActiveDispute
        ? 'Route immediately to concierge dispute arbitration'
        : 'Immediate high-priority outreach or account grace-period hold';
    } else if (consecutiveFailures >= 1 || subscriptionStability === 'past_due' || failedPaymentFrequency >= 2) {
      status = 'AT RISK';
      cancellationRisk = 'high';
      expansionLikelihood = 'low';
      recommendedAction = hasExpiringCard
        ? 'Dispatch 1-click secure card update link'
        : 'Trigger autonomous smart retry and customer dunning workflow';
    } else if (failedPaymentFrequency === 1 || subscriptionStability === 'expiring' || usageTrend === 'declining') {
      status = 'WATCH';
      cancellationRisk = 'moderate';
      expansionLikelihood = 'moderate';
      recommendedAction = subscriptionStability === 'expiring'
        ? 'Send proactive card renewal reminder'
        : 'Monitor next scheduled debit attempt';
    } else {
      status = 'HEALTHY';
      cancellationRisk = 'low';
      expansionLikelihood = paidInvoices.length >= 3 ? 'high' : 'moderate';
      recommendedAction = expansionLikelihood === 'high'
        ? 'Eligible for annual plan conversion or tier upgrade'
        : 'Account healthy with on-time recurring clearance';
    }

    const revenueAtRiskCents = activeUnresolvedOpps.reduce(
      (sum, opp) => sum + (opp.amount_at_risk_cents || 0),
      0
    );

    return {
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      workspaceId,
      currency: customer.currency || 'USD',
      status,
      paymentReliabilityPercent,
      failedPaymentFrequency,
      consecutiveFailures,
      subscriptionStability,
      usageTrend,
      cancellationRisk,
      expansionLikelihood,
      evidence,
      recommendedAction,
      revenueAtRiskCents,
      lifetimeValueCents: customer.lifetime_value_cents || 0,
      subscriptionPlanName: activeSub?.plan_name || pastDueSub?.plan_name,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates all customers within a workspace deterministically.
   */
  public static evaluateWorkspace(workspaceId: string): CustomerHealthProfile[] {
    if (!workspaceId) throw new Error('workspaceId is required');

    const customers = db.getCustomers(workspaceId);
    const profiles: CustomerHealthProfile[] = [];

    for (const cust of customers) {
      const profile = this.evaluateCustomer(workspaceId, cust.id);
      if (profile) {
        profiles.push(profile);
      }
    }

    return profiles;
  }

  /**
   * Computes aggregate health summary metrics.
   */
  public static getHealthSummary(workspaceId: string): {
    totalCustomers: number;
    healthyCount: number;
    watchCount: number;
    atRiskCount: number;
    criticalCount: number;
    totalRevenueAtRiskCents: number;
    highExpansionCandidatesCount: number;
  } {
    const profiles = this.evaluateWorkspace(workspaceId);

    let healthyCount = 0;
    let watchCount = 0;
    let atRiskCount = 0;
    let criticalCount = 0;
    let totalRevenueAtRiskCents = 0;
    let highExpansionCandidatesCount = 0;

    for (const p of profiles) {
      if (p.status === 'HEALTHY') healthyCount++;
      else if (p.status === 'WATCH') watchCount++;
      else if (p.status === 'AT RISK') atRiskCount++;
      else if (p.status === 'CRITICAL') criticalCount++;

      totalRevenueAtRiskCents += p.revenueAtRiskCents;
      if (p.expansionLikelihood === 'high') {
        highExpansionCandidatesCount++;
      }
    }

    return {
      totalCustomers: profiles.length,
      healthyCount,
      watchCount,
      atRiskCount,
      criticalCount,
      totalRevenueAtRiskCents,
      highExpansionCandidatesCount,
    };
  }
}
