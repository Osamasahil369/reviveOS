/**
 * ReviveOS Centralized Geo-Pricing Engine
 * Single authoritative source of truth for pricing across supported regions & currencies.
 *
 * Supported Currencies:
 * - India: INR (₹)
 * - USA: USD ($)
 * - UK: GBP (£)
 * - Europe: EUR (€)
 * - UAE: AED (AED)
 * - Singapore: SGD (S$)
 * - Australia: AUD (A$)
 */

export type SupportedCurrency = 'INR' | 'USD' | 'GBP' | 'EUR' | 'AED' | 'SGD' | 'AUD';
export type PlatformPlanTier = 'founding' | 'starter' | 'growth' | 'business' | 'enterprise';
export type PlatformBillingCycle = 'monthly' | 'annual';

export interface PlanPricingDetail {
  monthlyAmount: number; // In major currency unit (e.g. ₹999, $19)
  monthlyAmountSubunit: number; // In minor unit (e.g. 99900 paise, 1900 cents)
  annualAmount: number; // In major unit
  annualAmountSubunit: number; // In minor unit (with ~17% annual discount built-in)
  currency: SupportedCurrency;
  currencySymbol: string;
}

export interface PlanDefinition {
  id: PlatformPlanTier;
  name: string;
  badge?: string;
  popular?: boolean;
  description: string;
  isFoundingProgram?: boolean;
  maxFoundingSpots?: number;
  features: string[];
  limits: {
    workspaces: number;
    teamMembers: number;
    monthlyRecoveryCapCents: number;
    sourcesSupported: string[];
  };
  pricing: Record<SupportedCurrency, PlanPricingDetail> | any;
  monthlyPriceRupees?: number;
  monthlyPricePaise?: number;
  annualPriceRupees?: number;
  annualPricePaise?: number;
}

export class CentralPricingEngine {
  public static readonly FOUNDING_MAX_SLOTS = 20;

  public static readonly CURRENCY_METADATA: Record<SupportedCurrency, { symbol: string; name: string; countryCode: string }> = {
    INR: { symbol: '₹', name: 'Indian Rupee', countryCode: 'IN' },
    USD: { symbol: '$', name: 'US Dollar', countryCode: 'US' },
    GBP: { symbol: '£', name: 'British Pound', countryCode: 'GB' },
    EUR: { symbol: '€', name: 'Euro', countryCode: 'EU' },
    AED: { symbol: 'AED', name: 'UAE Dirham', countryCode: 'AE' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar', countryCode: 'SG' },
    AUD: { symbol: 'A$', name: 'Australian Dollar', countryCode: 'AU' },
  };

  public static readonly PLANS: Record<PlatformPlanTier, PlanDefinition> = {
    founding: {
      id: 'founding',
      name: 'Founding Customer',
      badge: '⚡ First 20 Only - Locked Forever',
      isFoundingProgram: true,
      maxFoundingSpots: 20,
      description: 'Exclusive founding membership for early adopters. Locked forever with zero price increases.',
      features: [
        'All Growth & Business Features Included',
        'Locked Forever Pricing (Never Increased)',
        'Exclusive Founding Customer Dashboard Badge',
        'Direct Access to Founding Product Team',
        'Priority Feature Requests & Roadmap Input',
        'White-Label & Agency Mode Included',
      ],
      limits: {
        workspaces: 10,
        teamMembers: 25,
        monthlyRecoveryCapCents: 50000000,
        sourcesSupported: ['All 30+ Connectors & Universal API'],
      },
      pricing: {
        INR: { monthlyAmount: 999, monthlyAmountSubunit: 99900, annualAmount: 9990, annualAmountSubunit: 999000, currency: 'INR', currencySymbol: '₹' },
        USD: { monthlyAmount: 19, monthlyAmountSubunit: 1900, annualAmount: 190, annualAmountSubunit: 19000, currency: 'USD', currencySymbol: '$' },
        GBP: { monthlyAmount: 15, monthlyAmountSubunit: 1500, annualAmount: 150, annualAmountSubunit: 15000, currency: 'GBP', currencySymbol: '£' },
        EUR: { monthlyAmount: 17, monthlyAmountSubunit: 1700, annualAmount: 170, annualAmountSubunit: 17000, currency: 'EUR', currencySymbol: '€' },
        AED: { monthlyAmount: 69, monthlyAmountSubunit: 6900, annualAmount: 690, annualAmountSubunit: 69000, currency: 'AED', currencySymbol: 'AED' },
        SGD: { monthlyAmount: 25, monthlyAmountSubunit: 2500, annualAmount: 250, annualAmountSubunit: 25000, currency: 'SGD', currencySymbol: 'S$' },
        AUD: { monthlyAmount: 29, monthlyAmountSubunit: 2900, annualAmount: 290, annualAmountSubunit: 29000, currency: 'AUD', currencySymbol: 'A$' },
      },
    },
    starter: {
      id: 'starter',
      name: 'Starter',
      description: 'Essential automated dunning and recovery infrastructure for single workspaces.',
      features: [
        'Single Workspace Support',
        'Recovery Autopilot',
        'Revenue Scanner',
        'Revenue Missions',
        'Email Recovery Infrastructure',
        'Universal Data Import (CSV/XLSX)',
        'Razorpay & Stripe Connection',
        'Core Reporting',
      ],
      limits: {
        workspaces: 1,
        teamMembers: 3,
        monthlyRecoveryCapCents: 10000000,
        sourcesSupported: ['Payments, E-commerce, Files'],
      },
      pricing: {
        INR: { monthlyAmount: 1999, monthlyAmountSubunit: 199900, annualAmount: 19990, annualAmountSubunit: 1999000, currency: 'INR', currencySymbol: '₹' },
        USD: { monthlyAmount: 19, monthlyAmountSubunit: 1900, annualAmount: 190, annualAmountSubunit: 19000, currency: 'USD', currencySymbol: '$' },
        GBP: { monthlyAmount: 15, monthlyAmountSubunit: 1500, annualAmount: 150, annualAmountSubunit: 15000, currency: 'GBP', currencySymbol: '£' },
        EUR: { monthlyAmount: 17, monthlyAmountSubunit: 1700, annualAmount: 170, annualAmountSubunit: 17000, currency: 'EUR', currencySymbol: '€' },
        AED: { monthlyAmount: 69, monthlyAmountSubunit: 6900, annualAmount: 690, annualAmountSubunit: 69000, currency: 'AED', currencySymbol: 'AED' },
        SGD: { monthlyAmount: 25, monthlyAmountSubunit: 2500, annualAmount: 250, annualAmountSubunit: 25000, currency: 'SGD', currencySymbol: 'S$' },
        AUD: { monthlyAmount: 29, monthlyAmountSubunit: 2900, annualAmount: 290, annualAmountSubunit: 29000, currency: 'AUD', currencySymbol: 'A$' },
      },
    },
    growth: {
      id: 'growth',
      name: 'Growth',
      badge: 'Most Popular',
      popular: true,
      description: 'Advanced revenue intelligence, multi-user access, and AI recovery for scaling brands.',
      features: [
        'Everything in Starter',
        'Advanced Revenue Intelligence',
        'Multi-user access & RBAC',
        'Advanced reporting & ROI breakdown',
        'Revenue Brain AI Assistant',
        'Churn Prevention & Prediction',
        'Expansion Intelligence',
        'Priority Support (4h SLA)',
      ],
      limits: {
        workspaces: 3,
        teamMembers: 10,
        monthlyRecoveryCapCents: 25000000,
        sourcesSupported: ['Payments, E-commerce, Accounting, CRM, Files'],
      },
      pricing: {
        INR: { monthlyAmount: 4999, monthlyAmountSubunit: 499900, annualAmount: 49990, annualAmountSubunit: 4999000, currency: 'INR', currencySymbol: '₹' },
        USD: { monthlyAmount: 59, monthlyAmountSubunit: 5900, annualAmount: 590, annualAmountSubunit: 59000, currency: 'USD', currencySymbol: '$' },
        GBP: { monthlyAmount: 49, monthlyAmountSubunit: 4900, annualAmount: 490, annualAmountSubunit: 49000, currency: 'GBP', currencySymbol: '£' },
        EUR: { monthlyAmount: 55, monthlyAmountSubunit: 5500, annualAmount: 550, annualAmountSubunit: 55000, currency: 'EUR', currencySymbol: '€' },
        AED: { monthlyAmount: 219, monthlyAmountSubunit: 21900, annualAmount: 2190, annualAmountSubunit: 219000, currency: 'AED', currencySymbol: 'AED' },
        SGD: { monthlyAmount: 79, monthlyAmountSubunit: 7900, annualAmount: 790, annualAmountSubunit: 79000, currency: 'SGD', currencySymbol: 'S$' },
        AUD: { monthlyAmount: 89, monthlyAmountSubunit: 8900, annualAmount: 890, annualAmountSubunit: 89000, currency: 'AUD', currencySymbol: 'A$' },
      },
    },
    business: {
      id: 'business',
      name: 'Business',
      description: 'Multi-business management, white-label reporting, and agency mode for power users.',
      features: [
        'Everything in Growth',
        'Multi-business management',
        'White-label reporting & client portal',
        'Advanced workflow automation',
        'Agency Mode & Partner Dashboard',
        'Custom Webhook Signatures & Security',
        'Premium Support (1h SLA)',
      ],
      limits: {
        workspaces: 10,
        teamMembers: 25,
        monthlyRecoveryCapCents: 100000000,
        sourcesSupported: ['All 30+ Ingestion Sources & Databases'],
      },
      pricing: {
        INR: { monthlyAmount: 9999, monthlyAmountSubunit: 999900, annualAmount: 99990, annualAmountSubunit: 9999000, currency: 'INR', currencySymbol: '₹' },
        USD: { monthlyAmount: 149, monthlyAmountSubunit: 14900, annualAmount: 1490, annualAmountSubunit: 149000, currency: 'USD', currencySymbol: '$' },
        GBP: { monthlyAmount: 119, monthlyAmountSubunit: 11900, annualAmount: 1190, annualAmountSubunit: 119000, currency: 'GBP', currencySymbol: '£' },
        EUR: { monthlyAmount: 139, monthlyAmountSubunit: 13900, annualAmount: 1390, annualAmountSubunit: 139000, currency: 'EUR', currencySymbol: '€' },
        AED: { monthlyAmount: 549, monthlyAmountSubunit: 54900, annualAmount: 5490, annualAmountSubunit: 549000, currency: 'AED', currencySymbol: 'AED' },
        SGD: { monthlyAmount: 199, monthlyAmountSubunit: 19900, annualAmount: 1990, annualAmountSubunit: 199000, currency: 'SGD', currencySymbol: 'S$' },
        AUD: { monthlyAmount: 229, monthlyAmountSubunit: 22900, annualAmount: 2290, annualAmountSubunit: 229000, currency: 'AUD', currencySymbol: 'A$' },
      },
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Custom infrastructure, dedicated onboarding, custom integrations, and SLA guarantees.',
      features: [
        'Custom Pricing (Contact Sales)',
        'Unlimited Workspaces & Team Members',
        'Custom Integrations & Dedicated Adapters',
        'Dedicated Onboarding & Account Manager',
        '99.99% Uptime SLA & Financial Guarantees',
        'Enterprise Security & SOC2 Reports',
      ],
      limits: {
        workspaces: 999,
        teamMembers: 999,
        monthlyRecoveryCapCents: 999999999,
        sourcesSupported: ['Unlimited Custom Connectors'],
      },
      pricing: {
        INR: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'INR', currencySymbol: '₹' },
        USD: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'USD', currencySymbol: '$' },
        GBP: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'GBP', currencySymbol: '£' },
        EUR: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'EUR', currencySymbol: '€' },
        AED: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'AED', currencySymbol: 'AED' },
        SGD: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'SGD', currencySymbol: 'S$' },
        AUD: { monthlyAmount: 0, monthlyAmountSubunit: 0, annualAmount: 0, annualAmountSubunit: 0, currency: 'AUD', currencySymbol: 'A$' },
      },
    },
  };

  /**
   * Detects currency based on country code, browser locale, or request headers
   */
  public static detectCurrency(options?: {
    countryCode?: string;
    locale?: string;
    clientIp?: string;
    billingCountry?: string;
  }): SupportedCurrency {
    const country = (options?.billingCountry || options?.countryCode || '').toUpperCase().trim();
    if (country === 'IN' || country === 'IND' || country === 'INDIA') return 'INR';
    if (country === 'US' || country === 'USA' || country === 'UNITED STATES') return 'USD';
    if (country === 'GB' || country === 'UK' || country === 'UNITED KINGDOM') return 'GBP';
    if (['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI'].includes(country)) return 'EUR';
    if (country === 'AE' || country === 'ARE' || country === 'UAE') return 'AED';
    if (country === 'SG' || country === 'SGP' || country === 'SINGAPORE') return 'SGD';
    if (country === 'AU' || country === 'AUS' || country === 'AUSTRALIA') return 'AUD';

    // Check locale
    const loc = (options?.locale || '').toLowerCase();
    if (loc.includes('in') || loc.includes('hi')) return 'INR';
    if (loc.includes('gb') || loc.includes('en-gb')) return 'GBP';
    if (loc.includes('de') || loc.includes('fr') || loc.includes('es') || loc.includes('it')) return 'EUR';
    if (loc.includes('ae') || loc.includes('ar')) return 'AED';
    if (loc.includes('sg')) return 'SGD';
    if (loc.includes('au')) return 'AUD';

    // Default to INR for India-first launch, fallback to USD
    return 'INR';
  }

  /**
   * Returns plan for a specific currency
   */
  public static getPlan(tier: PlatformPlanTier, currency: SupportedCurrency = 'INR') {
    const plan = this.PLANS[tier];
    if (!plan) throw new Error(`Unknown plan tier: ${tier}`);
    const pricing = plan.pricing[currency] || plan.pricing['INR'];
    return {
      id: plan.id,
      name: plan.name,
      badge: plan.badge,
      popular: plan.popular,
      description: plan.description,
      isFoundingProgram: plan.isFoundingProgram,
      maxFoundingSpots: plan.maxFoundingSpots,
      features: plan.features,
      limits: plan.limits,
      pricing,
      // Backward compatibility accessors for INR / Paise
      monthlyPriceRupees: pricing.monthlyAmount,
      monthlyPricePaise: pricing.monthlyAmountSubunit,
      annualPriceRupees: pricing.annualAmount,
      annualPricePaise: pricing.annualAmountSubunit,
    };
  }

  /**
   * Returns all plans formatted for requested currency
   */
  public static getAllPlans(currency: SupportedCurrency = 'INR') {
    return (Object.keys(this.PLANS) as PlatformPlanTier[]).map((tier) => this.getPlan(tier, currency));
  }

  /**
   * Computes sub-unit amount for a plan, cycle, and currency
   */
  public static calculateAmountSubunit(
    tier: PlatformPlanTier,
    cycle: PlatformBillingCycle,
    currency: SupportedCurrency = 'INR',
    isFounding: boolean = false
  ): number {
    const effectiveTier = isFounding ? 'founding' : tier;
    const plan = this.PLANS[effectiveTier];
    if (!plan) return 0;
    const pricing = plan.pricing[currency] || plan.pricing['INR'];
    return cycle === 'annual' ? pricing.annualAmountSubunit : pricing.monthlyAmountSubunit;
  }

  // Alias for backward compatibility
  public static calculateAmountPaise(tier: PlatformPlanTier, cycle: PlatformBillingCycle, isFounding: boolean = false): number {
    return this.calculateAmountSubunit(tier, cycle, 'INR', isFounding);
  }
}

// Backward-compatibility alias
export const CentralPricingConfig = CentralPricingEngine;
export type PlanTier = PlatformPlanTier;

