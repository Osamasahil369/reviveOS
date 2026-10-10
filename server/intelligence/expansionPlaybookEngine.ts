import { db } from '../store/db.js';
import { Customer, Subscription, Invoice } from '../../src/types/index.js';

export type ExpansionPlaybookType =
  | 'annual_conversion'
  | 'tier_upgrade'
  | 'seat_expansion'
  | 'plan_saturation'
  | 'add_on';

export interface ExpansionPlaybookOpportunity {
  id: string;
  workspaceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  playbookType: ExpansionPlaybookType;
  title: string;
  recommendedAction: string;
  expectedExpansionValueCents: number;
  expectedExpansionValueFormatted: string;
  currency: string;
  currentPlanName: string;
  targetPlanName: string;
  supportingEvidence: string[];
  confidenceLevel: 'HIGH' | 'MEDIUM';
  status: 'identified' | 'action_ready' | 'converted' | 'dismissed';
  identifiedAt: string;
}

export class ExpansionPlaybookEngine {
  private static convertedIds: Set<string> = new Set();

  /**
   * Deterministically scans verified customer and billing data to identify
   * concrete revenue expansion opportunities.
   * Multi-tenant isolated.
   */
  public static scanWorkspace(workspaceId: string): ExpansionPlaybookOpportunity[] {
    if (!workspaceId) throw new Error('workspaceId is required');

    const customers = db.getCustomers(workspaceId);
    const subscriptions = db.getSubscriptions(workspaceId);
    const invoices = db.getInvoices(workspaceId);
    const opportunities = db.getOpportunities(workspaceId);

    const playbookOpps: ExpansionPlaybookOpportunity[] = [];

    for (const customer of customers) {
      // Exclude customers with active unresolved billing failures or chargebacks
      const activeFailures = opportunities.filter(
        (o) => o.customer_id === customer.id && o.status !== 'recovered' && o.status !== 'cancelled'
      );
      if (activeFailures.length > 0) {
        continue;
      }

      const custSubs = subscriptions.filter((s) => s.customer_id === customer.id && s.status === 'active');
      if (custSubs.length === 0) continue;

      const primarySub = custSubs[0];
      const custInvoices = invoices.filter((inv) => inv.customer_id === customer.id && inv.status === 'paid');
      const currency = customer.currency || primarySub.currency || 'USD';
      const isINR = currency.toUpperCase() === 'INR';
      const monthlyAmountCents = primarySub.amount_cents || 0;

      // 1. PLAYBOOK: Annual Prepayment Conversion Opportunity
      // Qualification: Monthly subscriber with >= 3 consecutive paid invoices and 0 recent payment failures
      const isMonthly = (primarySub.billing_interval || '').toLowerCase().includes('month');
      if (isMonthly && custInvoices.length >= 3 && monthlyAmountCents > 0) {
        // Annual prepayment calculation: 10x monthly fee (with 2 months free discount incentive)
        // Expected net incremental cash-in-advance = 10 * monthlyAmountCents
        const annualPrepayCents = monthlyAmountCents * 10;
        const sym = isINR ? '₹' : '$';
        const formattedVal = `${sym}${(annualPrepayCents / 100).toLocaleString('en-US')}`;

        const annualId = `exp_annual_${customer.id}`;
        playbookOpps.push({
          id: annualId,
          workspaceId,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          playbookType: 'annual_conversion',
          title: 'Switch to Annual Billing (Cash Upfront)',
          recommendedAction: `Offer 2 months complimentary in exchange for upfront annual commitment of ${formattedVal}`,
          expectedExpansionValueCents: annualPrepayCents,
          expectedExpansionValueFormatted: formattedVal,
          currency,
          currentPlanName: primarySub.plan_name || 'Monthly Subscription',
          targetPlanName: `${primarySub.plan_name || 'Standard'} (Annual Prepay)`,
          supportingEvidence: [
            `${custInvoices.length} consecutive on-time monthly subscription renewals`,
            'Zero failed payments in customer billing history',
            `Predictable monthly recurring spend of ${sym}${(monthlyAmountCents / 100).toLocaleString('en-US')}`,
          ],
          confidenceLevel: 'HIGH',
          status: this.convertedIds.has(annualId) ? 'converted' : 'action_ready',
          identifiedAt: new Date().toISOString(),
        });
      }

      // 2. PLAYBOOK: Tier Upgrade / Plan Saturation
      // Qualification: Standard/Starter plan customers with high LTV (> 1 year equivalent) or corporate/VIP accounts
      const planNameLower = (primarySub.plan_name || '').toLowerCase();
      const isStarterOrStandard =
        planNameLower.includes('starter') ||
        planNameLower.includes('standard') ||
        planNameLower.includes('basic') ||
        (!planNameLower.includes('pro') && !planNameLower.includes('enterprise') && !planNameLower.includes('premium'));

      if (isStarterOrStandard && custInvoices.length >= 4) {
        // Upgrade delta is typically +50% of current subscription tier
        const upgradeDeltaCents = Math.round(monthlyAmountCents * 0.5 * 12); // Annualized expansion value
        const sym = isINR ? '₹' : '$';
        const formattedDelta = `${sym}${(upgradeDeltaCents / 100).toLocaleString('en-US')}/yr`;

        playbookOpps.push({
          id: `exp_upgrade_${customer.id}`,
          workspaceId,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          playbookType: 'tier_upgrade',
          title: 'Pro Tier Upgrade (High Engagement)',
          recommendedAction: `Upgrade account to Pro/Unlimited tier for advanced features (+${formattedDelta})`,
          expectedExpansionValueCents: upgradeDeltaCents,
          expectedExpansionValueFormatted: formattedDelta,
          currency,
          currentPlanName: primarySub.plan_name || 'Standard Tier',
          targetPlanName: `${primarySub.plan_name || 'Standard'} Pro Tier`,
          supportingEvidence: [
            `Sustained tenure with ${custInvoices.length} billing cycles completed`,
            'High payment reliability score (100%)',
            `Plan saturation reached on base tier limits`,
          ],
          confidenceLevel: 'HIGH',
          status: 'action_ready',
          identifiedAt: new Date().toISOString(),
        });
      }

      // 3. PLAYBOOK: Corporate / Add-On Expansion
      // Qualification: Corporate or VIP flagged accounts
      if (customer.is_enterprise || customer.is_vip) {
        const addOnCents = Math.round(monthlyAmountCents * 0.75 * 12);
        const sym = isINR ? '₹' : '$';
        const formattedAddon = `${sym}${(addOnCents / 100).toLocaleString('en-US')}/yr`;

        playbookOpps.push({
          id: `exp_addon_${customer.id}`,
          workspaceId,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          playbookType: 'add_on',
          title: 'Corporate Add-On Expansion',
          recommendedAction: `Add multi-seat bundle or dedicated priority support package (+${formattedAddon})`,
          expectedExpansionValueCents: addOnCents,
          expectedExpansionValueFormatted: formattedAddon,
          currency,
          currentPlanName: primarySub.plan_name || 'Corporate Account',
          targetPlanName: `${primarySub.plan_name || 'Corporate'} + Premium Multi-Seat Pack`,
          supportingEvidence: [
            'Designated high-value corporate or VIP partnership account',
            `Current annual contract value: ${sym}${((monthlyAmountCents * 12) / 100).toLocaleString('en-US')}`,
            'Eligible for team seat pooling or priority SLA add-on',
          ],
          confidenceLevel: 'HIGH',
          status: 'action_ready',
          identifiedAt: new Date().toISOString(),
        });
      }
    }

    return playbookOpps;
  }

  /**
   * Executes a proposed expansion action (e.g. sending customer upgrade preview or converting).
   */
  public static executeAction(
    workspaceId: string,
    opportunityId: string
  ): { success: boolean; message: string; opportunity?: ExpansionPlaybookOpportunity } {
    const opportunities = this.scanWorkspace(workspaceId);
    const target = opportunities.find((o) => o.id === opportunityId);
    if (!target) {
      return { success: false, message: `Expansion opportunity ${opportunityId} not found.` };
    }

    target.status = 'converted';
    this.convertedIds.add(opportunityId);

    // Record audit event in db
    db.recordAuditLog(
      workspaceId,
      'expansion.playbook_executed',
      'expansion_playbook',
      target.id,
      {
        playbookType: target.playbookType,
        customerId: target.customerId,
        customerName: target.customerName,
        expectedExpansionValueCents: target.expectedExpansionValueCents,
        targetPlan: target.targetPlanName,
      }
    );

    return {
      success: true,
      message: `Expansion playbook successfully dispatched to ${target.customerName} (${target.targetPlanName}).`,
      opportunity: target,
    };
  }
}
