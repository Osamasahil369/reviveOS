/**
 * Server-Side Validation Module for Revenue Recovery OS
 */

export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD',
  'JPY', 'CNY', 'HKD', 'SGD', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK',
  'DKK', 'ZAR', 'BRL', 'MXN', 'TRY', 'PLN', 'RUB'
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

const RFC_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export interface ServerValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  sanitized?: Record<string, any>;
}

export function validateCustomerInput(body: any): ServerValidationResult {
  const errors: Record<string, string> = {};
  const sanitized: Record<string, any> = {};

  // 1. Name validation
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.name = 'Customer name is required and must be at least 2 characters.';
  } else if (body.name.trim().length > 100) {
    errors.name = 'Customer name must not exceed 100 characters.';
  } else {
    sanitized.name = body.name.trim();
  }

  // 2. Email validation (RFC compliant)
  if (!body.email || typeof body.email !== 'string') {
    errors.email = 'Email address is required.';
  } else {
    const trimmedEmail = body.email.trim();
    if (!RFC_EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.indexOf('@') <= 0 || !trimmedEmail.includes('.')) {
      errors.email = 'Invalid email format. Must be an RFC-compliant address (e.g. user@example.com).';
    } else {
      sanitized.email = trimmedEmail.toLowerCase();
    }
  }

  // 3. Phone validation (E.164 and country-aware)
  if (body.phone && typeof body.phone === 'string' && body.phone.trim() !== '') {
    const rawPhone = body.phone.trim();
    if (/[a-zA-Z]/.test(rawPhone)) {
      errors.phone = 'Phone number must not contain letters or alphabetic characters.';
    } else {
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7) {
        errors.phone = 'Phone number is too short. International format requires at least 7 digits.';
      } else if (digitsOnly.length > 15) {
        errors.phone = 'Phone number exceeds maximum E.164 length of 15 digits.';
      } else {
        const hasLeadingPlus = rawPhone.startsWith('+');
        const defaultPrefixes: Record<string, string> = {
          IN: '+91', US: '+1', CA: '+1', GB: '+44', AE: '+971', SA: '+966', AU: '+61', SG: '+65', DE: '+49'
        };
        const country = (body.country || 'US').toUpperCase();
        const prefix = country in defaultPrefixes ? defaultPrefixes[country] : '+1';
        const formatted = hasLeadingPlus ? `+${digitsOnly}` : `${prefix}${digitsOnly}`;
        if (!E164_REGEX.test(formatted)) {
          errors.phone = 'Invalid phone number format. Must adhere to E.164 standard (e.g. +919876543210).';
        } else {
          sanitized.phone = formatted;
        }
      }
    }
  } else {
    sanitized.phone = '';
  }

  // 4. Currency validation
  if (body.currency) {
    const currUpper = String(body.currency).toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currUpper as any)) {
      errors.currency = `Unsupported currency "${body.currency}". Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}.`;
    } else {
      sanitized.currency = currUpper;
    }
  }

  // 5. Plan Amount
  if (body.plan_amount_cents !== undefined) {
    const amt = Number(body.plan_amount_cents);
    if (isNaN(amt) || amt < 0 || amt > 1000000000) {
      errors.plan_amount_cents = 'Plan amount must be a non-negative number within valid range.';
    } else {
      sanitized.plan_amount_cents = amt;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized,
  };
}

export function validateAmountAndCurrency(amountCents: any, currency?: string): ServerValidationResult {
  const errors: Record<string, string> = {};
  const sanitized: Record<string, any> = {};

  const num = Number(amountCents);
  if (isNaN(num) || num <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (num > 1000000000) {
    errors.amount = 'Amount exceeds maximum permitted limit.';
  } else {
    sanitized.amountCents = Math.round(num);
  }

  if (currency) {
    const upper = currency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(upper as any)) {
      errors.currency = `Invalid currency code "${currency}". Must be one of the 27 supported currencies.`;
    } else {
      sanitized.currency = upper;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized,
  };
}
