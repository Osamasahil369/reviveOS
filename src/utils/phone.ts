/**
 * Phone Number Normalization & Country Dial Code Engine
 * Adheres strictly to E.164 international telecom standards.
 * Supports auto-normalization from local numbers (e.g. 9876543210 -> +919876543210 for IN, 5551234567 -> +15551234567 for US).
 * Explicitly allows blank/empty phone numbers for customer records.
 */

export interface CountryDialConfig {
  code: string; // ISO 2-letter: 'IN', 'US', 'GB', etc.
  name: string; // 'India', 'United States'
  dialCode: string; // '+91', '+1'
  flag: string; // '🇮🇳', '🇺🇸'
  samplePhone: string; // '9876543210'
  placeholder: string;
}

export const COUNTRY_DIAL_CONFIGS: CountryDialConfig[] = [
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', samplePhone: '9876543210', placeholder: '98765 43210' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', samplePhone: '5551234567', placeholder: '(555) 123-4567' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', samplePhone: '7911123456', placeholder: '7911 123456' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', samplePhone: '4165550192', placeholder: '(416) 555-0192' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', samplePhone: '412345678', placeholder: '412 345 678' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', samplePhone: '15123456789', placeholder: '151 23456789' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', samplePhone: '612345678', placeholder: '6 12 34 56 78' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', samplePhone: '91234567', placeholder: '9123 4567' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', samplePhone: '501234567', placeholder: '50 123 4567' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', samplePhone: '501234567', placeholder: '50 123 4567' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', samplePhone: '9012345678', placeholder: '90 1234 5678' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', samplePhone: '11987654321', placeholder: '11 98765-4321' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', samplePhone: '851234567', placeholder: '85 123 4567' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', samplePhone: '612345678', placeholder: '6 12345678' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', samplePhone: '612345678', placeholder: '612 34 56 78' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', samplePhone: '3201234567', placeholder: '320 123 4567' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', samplePhone: '5512345678', placeholder: '55 1234 5678' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', samplePhone: '821234567', placeholder: '82 123 4567' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', samplePhone: '211234567', placeholder: '21 123 4567' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', samplePhone: '701234567', placeholder: '70 123 45 67' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', samplePhone: '791234567', placeholder: '79 123 45 67' },
];

export interface PhoneNormalizationResult {
  normalized: string; // The E.164 string (e.g. '+919876543210'), or '' if blank
  isValid: boolean;
  isBlank: boolean;
  wasNormalized: boolean;
  appliedDialCode?: string;
  original: string;
  error?: string;
}

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalizes phone numbers to E.164 format.
 * - Handles blank/empty string as valid.
 * - If country = India (IN) and phone is 9876543210 -> +919876543210.
 * - If country = US (US) and phone is 5551234567 -> +15551234567.
 * - Strips punctuation, spaces, brackets, hyphens.
 * - Strips leading zeros from local representations.
 */
export function normalizePhoneNumber(
  rawPhone: string | null | undefined,
  defaultCountryCode: string = 'US'
): PhoneNormalizationResult {
  const original = rawPhone == null ? '' : String(rawPhone);
  const trimmed = original.trim();

  // Requirement 4: Allow import even if phone field is blank
  if (!trimmed) {
    return {
      normalized: '',
      isValid: true,
      isBlank: true,
      wasNormalized: false,
      original,
    };
  }

  // Check if string contains alphabetic letters (strictly invalid)
  if (/[a-zA-Z]/.test(trimmed)) {
    return {
      normalized: trimmed,
      isValid: false,
      isBlank: false,
      wasNormalized: false,
      original,
      error: `Phone contains letters: "${trimmed}"`,
    };
  }

  // Strip non-digit characters except leading '+'
  const cleaned = trimmed.replace(/[\s\-\.\(\)\[\]_]/g, '');

  // Find country dial config
  const countryConfig =
    COUNTRY_DIAL_CONFIGS.find(
      (c) => c.code.toUpperCase() === defaultCountryCode.toUpperCase()
    ) ||
    COUNTRY_DIAL_CONFIGS.find((c) => c.code === 'US')!;

  const dialCode = countryConfig.dialCode; // e.g. '+91' or '+1'
  const dialDigits = dialCode.replace('+', ''); // '91' or '1'

  // Case 1: Already has leading '+'
  if (cleaned.startsWith('+')) {
    if (E164_REGEX.test(cleaned)) {
      return {
        normalized: cleaned,
        isValid: true,
        isBlank: false,
        wasNormalized: false,
        original,
      };
    } else {
      return {
        normalized: cleaned,
        isValid: false,
        isBlank: false,
        wasNormalized: false,
        original,
        error: `Invalid international format "${trimmed}". Must follow E.164 (+[1-9] followed by 7-14 digits).`,
      };
    }
  }

  // Case 2: International exit code '00'
  if (cleaned.startsWith('00')) {
    const withPlus = '+' + cleaned.substring(2);
    if (E164_REGEX.test(withPlus)) {
      return {
        normalized: withPlus,
        isValid: true,
        isBlank: false,
        wasNormalized: true,
        appliedDialCode: '+',
        original,
      };
    }
  }

  // Case 3: Local digits without '+'
  // Strip leading zeros (common in Indian 09876543210 or UK 07911123456)
  const digitsWithoutLeadingZero = cleaned.replace(/^0+/, '');

  let candidate = '';
  let appliedPrefix = dialCode;

  // Check if user already included the dial code digits without '+'
  // E.g., India: 919876543210 (12 digits starting with 91)
  // E.g., US: 15551234567 (11 digits starting with 1)
  if (
    dialDigits.length > 0 &&
    digitsWithoutLeadingZero.startsWith(dialDigits) &&
    digitsWithoutLeadingZero.length >= 10 + dialDigits.length - 1
  ) {
    candidate = `+${digitsWithoutLeadingZero}`;
    appliedPrefix = '+';
  } else {
    // Local 10-digit or national number
    // E.g., 9876543210 -> +919876543210
    // E.g., 5551234567 -> +15551234567
    candidate = `${dialCode}${digitsWithoutLeadingZero}`;
  }

  if (E164_REGEX.test(candidate)) {
    return {
      normalized: candidate,
      isValid: true,
      isBlank: false,
      wasNormalized: true,
      appliedDialCode: appliedPrefix,
      original,
    };
  }

  return {
    normalized: candidate || cleaned,
    isValid: false,
    isBlank: false,
    wasNormalized: false,
    original,
    error: `Could not normalize "${trimmed}" to E.164 format. Expected format like ${countryConfig.samplePhone} or ${countryConfig.dialCode}${countryConfig.samplePhone}`,
  };
}

export function getDefaultCountryForWorkspace(
  workspace?: { currency?: string; country?: string } | null
): string {
  if (!workspace) return 'US';
  if (workspace.country) {
    const found = COUNTRY_DIAL_CONFIGS.find(
      (c) => c.code.toUpperCase() === workspace.country?.toUpperCase()
    );
    if (found) return found.code;
  }
  if (workspace.currency === 'INR') return 'IN';
  if (workspace.currency === 'GBP') return 'GB';
  if (workspace.currency === 'CAD') return 'CA';
  if (workspace.currency === 'AUD') return 'AU';
  if (workspace.currency === 'EUR') return 'DE';
  if (workspace.currency === 'AED') return 'AE';
  if (workspace.currency === 'SAR') return 'SA';
  if (workspace.currency === 'SGD') return 'SG';
  if (workspace.currency === 'JPY') return 'JP';
  if (workspace.currency === 'BRL') return 'BR';
  return 'US';
}

// ==========================================
// COLUMN MAPPINGS DEFINITION (Requirement 10)
// ==========================================
export interface ColumnMapping {
  customer_name: string;
  email: string;
  phone: string;
  amount: string;
  currency: string;
  provider: string;
  subscription_type: string;
  next_billing_date: string;
}

export interface TargetFieldDef {
  key: keyof ColumnMapping;
  label: string;
  required: boolean;
  description: string;
  samplePlaceholder: string;
}

export const TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: 'customer_name',
    label: 'Customer Name',
    required: true,
    description: 'Subscriber or customer legal name',
    samplePlaceholder: 'Sophia Martinez',
  },
  {
    key: 'email',
    label: 'Email Address',
    required: true,
    description: 'Primary customer email for invoice recovery & notifications',
    samplePlaceholder: 'sophia.martinez@hypertech.io',
  },
  {
    key: 'phone',
    label: 'Phone Number',
    required: false,
    description: 'Direct phone number (auto-normalized to E.164; blank allowed)',
    samplePlaceholder: '9876543210',
  },
  {
    key: 'amount',
    label: 'Subscription Amount',
    required: true,
    description: 'Recurring price or invoice amount in major units',
    samplePlaceholder: '299.00',
  },
  {
    key: 'currency',
    label: 'Currency',
    required: false,
    description: 'ISO 3-letter currency code (defaults to workspace currency)',
    samplePlaceholder: 'USD',
  },
  {
    key: 'provider',
    label: 'Payment Provider',
    required: false,
    description: 'Gateway (Stripe, Razorpay, PayPal; defaults to Stripe)',
    samplePlaceholder: 'stripe',
  },
  {
    key: 'subscription_type',
    label: 'Subscription Type',
    required: false,
    description: 'Billing interval (monthly, yearly, quarterly, weekly)',
    samplePlaceholder: 'monthly',
  },
  {
    key: 'next_billing_date',
    label: 'Next Billing Date',
    required: false,
    description: 'Next renewal or due date (YYYY-MM-DD)',
    samplePlaceholder: '2026-10-15',
  },
];

export function autoDetectMappings(csvHeaders: string[]): ColumnMapping {
  const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

  const findBestHeader = (candidates: string[]) => {
    for (const cand of candidates) {
      const candNorm = normalize(cand);
      const match = csvHeaders.find(
        (h) => normalize(h) === candNorm || normalize(h).includes(candNorm)
      );
      if (match) return match;
    }
    return '';
  };

  return {
    customer_name: findBestHeader([
      'customer_name',
      'name',
      'full_name',
      'client_name',
      'subscriber',
      'customer',
      'company',
    ]),
    email: findBestHeader([
      'email',
      'customer_email',
      'mail',
      'user_email',
      'email_address',
    ]),
    phone: findBestHeader([
      'phone',
      'customer_phone',
      'mobile',
      'telephone',
      'phone_number',
      'contact',
      'cell',
      'cellphone',
    ]),
    amount: findBestHeader([
      'amount',
      'subscription_amount',
      'amount_due',
      'amount_cents',
      'price',
      'charge',
      'invoice_amount',
      'fee',
    ]),
    currency: findBestHeader(['currency', 'currency_code', 'curr']),
    provider: findBestHeader([
      'provider',
      'payment_provider',
      'gateway',
      'provider_type',
      'source',
    ]),
    subscription_type: findBestHeader([
      'subscription_type',
      'type',
      'cadence',
      'interval',
      'billing_cycle',
      'plan',
      'frequency',
    ]),
    next_billing_date: findBestHeader([
      'next_billing_date',
      'billing_date',
      'next_renewal',
      'due_date',
      'date',
      'renewal_date',
    ]),
  };
}

/**
 * Downloads a structured error report CSV for all failed and rejected records.
 * Requirement 6
 */
export function downloadErrorReportCsv(
  errors: Array<{
    rowNumber?: number;
    name?: string;
    email?: string;
    phone?: string;
    amount?: number | string;
    currency?: string;
    error: string;
  }>,
  fileName: string = 'recovery_import_errors.csv'
) {
  const headers = ['Row Number', 'Customer Name', 'Email', 'Phone', 'Amount', 'Currency', 'Failure Reason'];
  const escapeCsv = (val: any) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = errors.map((e) => [
    e.rowNumber || '',
    escapeCsv(e.name || ''),
    escapeCsv(e.email || ''),
    escapeCsv(e.phone || ''),
    escapeCsv(e.amount ?? ''),
    escapeCsv(e.currency || ''),
    escapeCsv(e.error),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a ready-to-use sample CSV template for users.
 * Requirement 8
 */
export function downloadSampleCsvTemplate(defaultCountry: string = 'IN') {
  const isIndia = defaultCountry === 'IN';
  const sampleRows = [
    [
      'customer_name',
      'email',
      'phone',
      'amount',
      'currency',
      'provider',
      'subscription_type',
      'next_billing_date',
      'invoice_id',
      'failure_reason',
    ],
    [
      'Aarav Sharma',
      'aarav.sharma@techflow.in',
      '9876543210',
      '299',
      'INR',
      'razorpay',
      'monthly',
      '2026-10-15',
      'inv_in_901',
      'insufficient_funds',
    ],
    [
      'Sophia Martinez',
      'sophia.martinez@hypertech.io',
      '5551234567',
      '349',
      'USD',
      'stripe',
      'monthly',
      '2026-10-20',
      'inv_us_902',
      'expired_card',
    ],
    [
      'Liam O\'Connor',
      'liam@dublindata.ie',
      '',
      '149',
      'EUR',
      'stripe',
      'monthly',
      '2026-10-18',
      'inv_eu_903',
      'payment_method_declined',
    ],
    [
      'Oliver Smith',
      'oliver@fintechlondon.co.uk',
      '+447911123456',
      '450',
      'GBP',
      'stripe',
      'yearly',
      '2027-09-01',
      'inv_uk_904',
      'authentication_required',
    ],
    [
      'Mateo Rossi',
      'mateo@milandesign.it',
      '3201234567',
      '280',
      'EUR',
      'paypal',
      'quarterly',
      '2026-12-01',
      'inv_it_905',
      'insufficient_funds',
    ],
    [
      'Chloe Dubois',
      'chloe@atelierparis.fr',
      '',
      '199',
      'EUR',
      'stripe',
      'monthly',
      '2026-10-22',
      'inv_fr_906',
      'bank_related_failure',
    ],
  ];

  const csvContent = sampleRows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'subscribers_recovery_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
