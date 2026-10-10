import { Customer, CustomerHealthScore, ChurnRiskLevel, PaymentFailure, Invoice } from '../types/index.js';

export interface HealthCalculationParams {
  failedPaymentsCount: number;
  retriesCount: number;
  lastPaymentDate?: string;
  openInvoiceAgeDays?: number;
  subscriptionCreatedAt?: string;
  hasPastDueInvoice?: boolean;
}

/**
 * Calculates Customer Churn Risk & Health Score (0 - 100)
 */
export function calculateCustomerHealthScore(params: HealthCalculationParams): CustomerHealthScore {
  let score = 100;
  const reasons: string[] = [];

  // Factor 1: Failed Payments Penalty
  // Each failed payment significantly docks health
  let failedPenalty = 0;
  if (params.failedPaymentsCount > 0) {
    if (params.failedPaymentsCount === 1) {
      failedPenalty = 15;
      reasons.push('1 recent payment failure recorded');
    } else if (params.failedPaymentsCount === 2) {
      failedPenalty = 30;
      reasons.push('2 recurring payment failures');
    } else {
      failedPenalty = Math.min(50, 30 + (params.failedPaymentsCount - 2) * 10);
      reasons.push(`${params.failedPaymentsCount} multiple payment failures`);
    }
  }
  score -= failedPenalty;

  // Factor 2: Payment Retries Penalty
  let retriesPenalty = 0;
  if (params.retriesCount > 0) {
    retriesPenalty = Math.min(25, params.retriesCount * 8);
    reasons.push(`${params.retriesCount} retry attempt(s) triggered`);
  }
  score -= retriesPenalty;

  // Factor 3: Open Invoice Age / Past Due Penalty
  let invoiceAgePenalty = 0;
  if (params.hasPastDueInvoice && params.openInvoiceAgeDays !== undefined) {
    if (params.openInvoiceAgeDays > 30) {
      invoiceAgePenalty = 30;
      reasons.push(`Invoice severely overdue (${params.openInvoiceAgeDays} days)`);
    } else if (params.openInvoiceAgeDays > 14) {
      invoiceAgePenalty = 20;
      reasons.push(`Invoice overdue by ${params.openInvoiceAgeDays} days`);
    } else if (params.openInvoiceAgeDays > 3) {
      invoiceAgePenalty = 10;
      reasons.push(`Invoice past due (${params.openInvoiceAgeDays} days)`);
    }
  }
  score -= invoiceAgePenalty;

  // Factor 4: Last Payment Date Recency Penalty
  let lastPaymentPenalty = 0;
  if (params.lastPaymentDate) {
    const daysSincePayment = Math.floor(
      (Date.now() - new Date(params.lastPaymentDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePayment > 60 && params.failedPaymentsCount > 0) {
      lastPaymentPenalty = 15;
      reasons.push(`No successful payment in past ${daysSincePayment} days`);
    }
  }
  score -= lastPaymentPenalty;

  // Factor 5: Subscription Age / Loyalty Bonus
  let loyaltyBonus = 0;
  if (params.subscriptionCreatedAt) {
    const tenureDays = Math.floor(
      (Date.now() - new Date(params.subscriptionCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (tenureDays > 180 && params.failedPaymentsCount === 0) {
      loyaltyBonus = 10; // Long-standing reliable customer
    } else if (tenureDays > 90) {
      loyaltyBonus = 5;
    }
  }
  score = Math.min(100, Math.max(0, score + loyaltyBonus));

  // Determine Risk Category
  let risk_level: ChurnRiskLevel;
  if (score >= 80) {
    risk_level = 'Low Risk';
  } else if (score >= 55) {
    risk_level = 'Medium Risk';
  } else if (score >= 30) {
    risk_level = 'High Risk';
  } else {
    risk_level = 'Critical Risk';
  }

  if (reasons.length === 0) {
    reasons.push('Account in excellent standing, no recent billing disruptions');
  }

  return {
    score,
    risk_level,
    factors: {
      failed_payments_penalty: failedPenalty,
      retries_penalty: retriesPenalty,
      last_payment_penalty: lastPaymentPenalty,
      invoice_age_penalty: invoiceAgePenalty,
      loyalty_bonus: loyaltyBonus,
    },
    risk_reasons: reasons,
  };
}

/**
 * Returns badge styling and color metadata for each risk tier
 */
export function getHealthScoreBadge(riskLevel: ChurnRiskLevel): {
  bg: string;
  text: string;
  border: string;
  dotBg: string;
} {
  switch (riskLevel) {
    case 'Low Risk':
      return {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        dotBg: 'bg-emerald-400',
      };
    case 'Medium Risk':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        dotBg: 'bg-amber-400',
      };
    case 'High Risk':
      return {
        bg: 'bg-orange-500/10',
        text: 'text-orange-400',
        border: 'border-orange-500/30',
        dotBg: 'bg-orange-400',
      };
    case 'Critical Risk':
      return {
        bg: 'bg-rose-500/15',
        text: 'text-rose-400',
        border: 'border-rose-500/40',
        dotBg: 'bg-rose-500',
      };
  }
}

/**
 * Safely extracts the numeric health score (0-100) whether health_score is
 * a CustomerHealthScore object, a number, or undefined/null.
 */
export function extractHealthScoreNumber(
  healthScore?: CustomerHealthScore | number | null,
  fallback: number = 85
): number {
  if (healthScore === undefined || healthScore === null) return fallback;
  if (typeof healthScore === 'number') {
    return isNaN(healthScore) ? fallback : healthScore;
  }
  if (typeof healthScore === 'object' && typeof healthScore.score === 'number') {
    return isNaN(healthScore.score) ? fallback : healthScore.score;
  }
  return fallback;
}

/**
 * Derives a letter grade from a health score
 */
export function getHealthGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * Safely extracts the risk reasons / diagnostic drivers from a CustomerHealthScore object or fallback array.
 */
export function extractHealthReasons(
  healthScore?: CustomerHealthScore | number | null,
  fallbackReasons?: string[]
): string[] {
  if (
    typeof healthScore === 'object' &&
    healthScore !== null &&
    Array.isArray(healthScore.risk_reasons) &&
    healthScore.risk_reasons.length > 0
  ) {
    return healthScore.risk_reasons;
  }
  return fallbackReasons || [];
}
