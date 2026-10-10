/**
 * Recovery Autopilot Engine (Billion-Dollar Execution Phase)
 * Heart of ReviveOS automated revenue recovery.
 */

export interface RecoveryPlan {
  opportunityId: string;
  customerId: string;
  customerName: string;
  amountCents: number;
  failureType: 'failed_payment' | 'expired_card' | 'unpaid_invoice' | 'soft_decline' | 'hard_decline';
  currentStepIndex: number;
  steps: {
    dayOffset: number;
    action: string;
    status: 'pending' | 'executed' | 'failed' | 'requires_approval';
    executedAt?: string;
  }[];
  requiresApproval: boolean;
  status: 'active' | 'escalated' | 'recovered' | 'closed';
}

export class RecoveryAutopilotEngine {
  /**
   * Generates deterministic recovery playbook steps based on failure type.
   */
  public static generatePlaybook(
    failureType: 'failed_payment' | 'expired_card' | 'unpaid_invoice' | 'soft_decline' | 'hard_decline',
    amountCents: number,
    isVipOrHighValue: boolean
  ): RecoveryPlan['steps'] {
    if (failureType === 'expired_card') {
      return [
        { dayOffset: 0, action: 'Send secure payment method update link', status: 'pending' },
        { dayOffset: 2, action: 'Send friendly card update reminder email', status: 'pending' },
        { dayOffset: 4, action: 'Retry charge automatically after update', status: 'pending' },
        { dayOffset: 7, action: 'Escalate to manual review if unassigned', status: isVipOrHighValue ? 'requires_approval' : 'pending' },
      ];
    }

    if (failureType === 'unpaid_invoice') {
      return [
        { dayOffset: 0, action: 'Send invoice reminder notice', status: 'pending' },
        { dayOffset: 3, action: 'Send 1-click recovery payment link', status: 'pending' },
        { dayOffset: 7, action: 'Escalation workflow and account alert', status: 'pending' },
        { dayOffset: 10, action: 'Manual review and final collection check', status: 'requires_approval' },
      ];
    }

    // Default Failed Payment / Decline playbook (Day 0, 2, 4, 7, 10)
    return [
      { dayOffset: 0, action: 'Retry payment charge via gateway', status: 'pending' },
      { dayOffset: 2, action: 'Send automated recovery email reminder', status: 'pending' },
      { dayOffset: 4, action: 'Send payment method update request', status: 'pending' },
      { dayOffset: 7, action: 'Send 1-click recovery payment link', status: 'pending' },
      { dayOffset: 10, action: 'Escalate to manual approval review', status: isVipOrHighValue || amountCents >= 25000 ? 'requires_approval' : 'pending' },
    ];
  }

  /**
   * Evaluates if an opportunity requires immediate human approval.
   */
  public static requiresApproval(amountCents: number, isVip: boolean, isFraud: boolean): boolean {
    return isFraud || isVip || amountCents >= 25000;
  }
}
