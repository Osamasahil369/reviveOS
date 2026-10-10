import { BillingIntervalType, CustomIntervalUnit, Subscription } from '../types/index.js';

export interface BillingIntervalOption {
  value: BillingIntervalType;
  label: string;
  description: string;
}

export const BILLING_INTERVAL_OPTIONS: BillingIntervalOption[] = [
  { value: 'monthly', label: 'Monthly', description: 'Billed once each month (Standard)' },
  { value: 'one_time', label: 'One Time Payment', description: 'Single charge, no recurring renewals' },
  { value: 'daily', label: 'Daily', description: 'Billed every calendar day' },
  { value: 'weekly', label: 'Weekly', description: 'Billed every 7 days' },
  { value: 'bi_weekly', label: 'Bi-Weekly', description: 'Billed every 14 days' },
  { value: 'every_2_months', label: 'Every 2 Months', description: 'Billed bi-monthly' },
  { value: 'quarterly', label: 'Quarterly', description: 'Billed every 3 months' },
  { value: 'every_6_months', label: 'Every 6 Months', description: 'Billed semi-annually' },
  { value: 'yearly', label: 'Yearly', description: 'Billed once per year' },
  { value: 'custom', label: 'Custom Interval...', description: 'Specify custom duration (e.g., 3 Months, 5 Weeks, 18 Days)' },
];

export const CUSTOM_INTERVAL_UNITS: { value: CustomIntervalUnit; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
];

/**
 * Calculates next billing date from a reference start date
 */
export function calculateNextBillingDate(
  startDateStr: string,
  interval: BillingIntervalType,
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): string {
  if (interval === 'one_time') {
    return ''; // No next billing date for one time
  }

  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  switch (interval) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'bi_weekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'every_2_months':
      d.setMonth(d.getMonth() + 2);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'every_6_months':
      d.setMonth(d.getMonth() + 6);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    case 'custom': {
      const count = Math.max(1, customCount || 1);
      if (customUnit === 'days') {
        d.setDate(d.getDate() + count);
      } else if (customUnit === 'weeks') {
        d.setDate(d.getDate() + count * 7);
      } else if (customUnit === 'months') {
        d.setMonth(d.getMonth() + count);
      } else if (customUnit === 'years') {
        d.setFullYear(d.getFullYear() + count);
      }
      break;
    }
  }

  return d.toISOString();
}

/**
 * Friendly label for billing intervals
 */
export function formatBillingInterval(
  interval: BillingIntervalType | string,
  customCount?: number,
  customUnit?: CustomIntervalUnit
): string {
  if (interval === 'custom') {
    const count = customCount || 1;
    const unit = customUnit || 'months';
    return `Every ${count} ${count === 1 ? unit.replace(/s$/, '') : unit}`;
  }

  const match = BILLING_INTERVAL_OPTIONS.find((opt) => opt.value === interval);
  if (match) return match.label;

  // Fallbacks for legacy string values
  if (interval === 'month') return 'Monthly';
  if (interval === 'year') return 'Yearly';
  if (interval === 'week') return 'Weekly';
  return interval;
}

/**
 * Normalizes subscription amount to Monthly Recurring Revenue (MRR) equivalent in cents
 */
export function calculateMonthlyEquivalent(
  amountCents: number,
  interval: BillingIntervalType | string,
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): number {
  if (interval === 'one_time') return 0; // One time is non-recurring
  if (interval === 'monthly' || interval === 'month') return amountCents;
  if (interval === 'daily') return Math.round(amountCents * 30.4375);
  if (interval === 'weekly' || interval === 'week') return Math.round((amountCents * 52) / 12);
  if (interval === 'bi_weekly') return Math.round((amountCents * 26) / 12);
  if (interval === 'every_2_months') return Math.round(amountCents / 2);
  if (interval === 'quarterly') return Math.round(amountCents / 3);
  if (interval === 'every_6_months') return Math.round(amountCents / 6);
  if (interval === 'yearly' || interval === 'year') return Math.round(amountCents / 12);

  if (interval === 'custom') {
    const count = Math.max(1, customCount || 1);
    if (customUnit === 'days') return Math.round((amountCents / count) * 30.4375);
    if (customUnit === 'weeks') return Math.round(((amountCents / count) * 52) / 12);
    if (customUnit === 'months') return Math.round(amountCents / count);
    if (customUnit === 'years') return Math.round(amountCents / (count * 12));
  }

  return amountCents;
}

/**
 * Normalizes subscription amount to Annual Recurring Revenue (ARR) equivalent in cents based on exact interval
 */
export function calculateAnnualEquivalent(
  amountCents: number,
  interval: BillingIntervalType | string,
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): number {
  if (interval === 'one_time') return 0;
  if (interval === 'yearly' || interval === 'year') return amountCents;
  if (interval === 'monthly' || interval === 'month') return amountCents * 12;
  if (interval === 'daily') return Math.round(amountCents * 365.25);
  if (interval === 'weekly' || interval === 'week') return amountCents * 52;
  if (interval === 'bi_weekly') return amountCents * 26;
  if (interval === 'every_2_months') return amountCents * 6;
  if (interval === 'quarterly') return amountCents * 4;
  if (interval === 'every_6_months') return amountCents * 2;

  if (interval === 'custom') {
    const count = Math.max(1, customCount || 1);
    if (customUnit === 'days') return Math.round((amountCents / count) * 365.25);
    if (customUnit === 'weeks') return Math.round((amountCents / count) * 52);
    if (customUnit === 'months') return Math.round((amountCents / count) * 12);
    if (customUnit === 'years') return Math.round(amountCents / count);
  }

  return amountCents * 12;
}

/**
 * Checks trial & grace period statuses
 */
export function evaluateSubscriptionPeriods(sub: Subscription): {
  isInTrial: boolean;
  isInGrace: boolean;
  trialDaysLeft: number;
  graceDaysLeft: number;
} {
  const now = Date.now();

  let isInTrial = false;
  let trialDaysLeft = 0;
  if (sub.trial_end_date) {
    const trialEnd = new Date(sub.trial_end_date).getTime();
    if (trialEnd > now) {
      isInTrial = true;
      trialDaysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
    }
  }

  let isInGrace = false;
  let graceDaysLeft = 0;
  if (sub.grace_period_end_date) {
    const graceEnd = new Date(sub.grace_period_end_date).getTime();
    if (graceEnd > now && (sub.status === 'past_due' || sub.status === 'unpaid')) {
      isInGrace = true;
      graceDaysLeft = Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)));
    }
  }

  return { isInTrial, isInGrace, trialDaysLeft, graceDaysLeft };
}
