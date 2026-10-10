export type BusinessType = 'saas' | 'subscription' | 'coaching' | 'membership' | 'gym' | 'ecommerce' | 'restaurant' | 'cafe' | 'agency';

export interface TerminologyConfig {
  mrrLabel: string;
  arrLabel: string;
  churnLabel: string;
  customerLabel: string;
  customersLabel: string;
  leakageLabel: string;
  recoveryLabel: string;
  subscriptionLabel: string;
}

const DEFAULT_TERMS: TerminologyConfig = {
  mrrLabel: 'Monthly Recurring Revenue (MRR)',
  arrLabel: 'Annual Recurring Revenue (ARR)',
  churnLabel: 'Customer Churn',
  customerLabel: 'Customer',
  customersLabel: 'Customers',
  leakageLabel: 'Revenue Leakage',
  recoveryLabel: 'Recovery Opportunity',
  subscriptionLabel: 'Subscription',
};

const TERMS_BY_TYPE: Record<string, Partial<TerminologyConfig>> = {
  gym: {
    mrrLabel: 'Monthly Membership Revenue',
    arrLabel: 'Annual Membership Revenue',
    churnLabel: 'Member Loss',
    customerLabel: 'Member',
    customersLabel: 'Members',
    leakageLabel: 'Missed Payments',
    recoveryLabel: 'Collectable Revenue',
    subscriptionLabel: 'Membership Plan',
  },
  membership: {
    mrrLabel: 'Monthly Membership Revenue',
    arrLabel: 'Annual Membership Revenue',
    churnLabel: 'Member Loss',
    customerLabel: 'Member',
    customersLabel: 'Members',
    leakageLabel: 'Missed Payments',
    recoveryLabel: 'Collectable Revenue',
    subscriptionLabel: 'Membership Plan',
  },
  restaurant: {
    mrrLabel: 'Monthly Recurring Invoices',
    arrLabel: 'Annual Projected Sales',
    churnLabel: 'Subscriber Loss',
    customerLabel: 'Client',
    customersLabel: 'Clients',
    leakageLabel: 'Missed Payments',
    recoveryLabel: 'Collectable Revenue',
    subscriptionLabel: 'Corporate / Member Plan',
  },
  cafe: {
    mrrLabel: 'Monthly Recurring Invoices',
    arrLabel: 'Annual Projected Sales',
    churnLabel: 'Subscriber Loss',
    customerLabel: 'Client',
    customersLabel: 'Clients',
    leakageLabel: 'Missed Payments',
    recoveryLabel: 'Collectable Revenue',
    subscriptionLabel: 'Corporate / Member Plan',
  },
  agency: {
    mrrLabel: 'Monthly Recurring Billings',
    arrLabel: 'Annual Billing Potential',
    churnLabel: 'Client Churn',
    customerLabel: 'Client',
    customersLabel: 'Clients',
    leakageLabel: 'Missed Fees',
    recoveryLabel: 'Client Payment Recovery',
    subscriptionLabel: 'Retainer Agreement',
  },
};

export function getTerminology(businessType?: string): TerminologyConfig {
  const type = (businessType || 'saas').toLowerCase();
  const overrides = TERMS_BY_TYPE[type] || {};
  return {
    ...DEFAULT_TERMS,
    ...overrides,
  };
}
