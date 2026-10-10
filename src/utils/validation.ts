/**
 * Data Validation Framework for Revenue Recovery OS
 * Enforces RFC-compliant email checks, E.164 country-aware phone validation,
 * customer name, currency verification, and financial amount guards.
 */

import { isSupportedCurrency, SupportedCurrency } from './currency.js';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
}

export interface CustomerFormFields {
  name: string;
  email: string;
  phone?: string;
  country?: string;
  currency?: string;
  planName?: string;
  planAmount?: string | number;
  billingInterval?: string;
}

export interface CustomerFormErrors {
  name?: string;
  email?: string;
  phone?: string;
  currency?: string;
  planName?: string;
  planAmount?: string;
  general?: string;
}

/**
 * Standard RFC 5322 compliant regex pattern
 * Disallows leading/trailing dots, spaces, invalid domain formats like user@, @gmail.com, user@.com, user@com
 */
const RFC_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates email according to RFC standards.
 * Passes: user@gmail.com, test@company.co.uk
 * Fails: abc, user@, @gmail.com, user@.com, user@domain
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email address is required.' };
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Email address cannot be empty.' };
  }

  if (trimmed.length > 254) {
    return { isValid: false, error: 'Email address exceeds maximum length of 254 characters.' };
  }

  // Must contain exactly one @ symbol not at start or end
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1 || trimmed.indexOf('@', atIndex + 1) !== -1) {
    return { isValid: false, error: 'Please enter a complete email address (e.g. user@company.com).' };
  }

  const [localPart, domainPart] = trimmed.split('@');
  if (!domainPart || !domainPart.includes('.')) {
    return { isValid: false, error: 'Email domain must include a valid top-level domain (e.g. .com or .co.uk).' };
  }

  const domainParts = domainPart.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return { isValid: false, error: 'Email domain must end with a valid domain extension (e.g. .com, .org).' };
  }

  if (!RFC_EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, error: 'Invalid email format. Format must be name@example.com' };
  }

  return { isValid: true, normalized: trimmed.toLowerCase() };
}

/**
 * E.164 Phone format validation.
 * Supports country-aware dialing codes.
 * Minimum 7 digits (with country code), maximum 15 digits total.
 * Rejects letters, malformed symbols, and short numbers like 123.
 */
export function validatePhone(phone: string | undefined | null, countryCode?: string): ValidationResult {
  if (!phone || phone.trim() === '') {
    // Phone is optional for some workflows, but if provided must be strictly valid
    return { isValid: true, normalized: '' };
  }

  const raw = phone.trim();

  // Detect illegal characters (letters, illegal symbols)
  if (/[a-zA-Z]/.test(raw)) {
    return { isValid: false, error: 'Phone numbers must not contain letters or text characters.' };
  }

  // Sanitize: allow only +, digits, spaces, parentheses, hyphens
  if (/[^0-9+\s\-().]/.test(raw)) {
    return { isValid: false, error: 'Phone number contains invalid characters. Use digits and + only.' };
  }

  // Extract digits and check leading plus
  const hasLeadingPlus = raw.startsWith('+');
  const digitsOnly = raw.replace(/\D/g, '');

  if (digitsOnly.length < 7) {
    return { isValid: false, error: 'Phone number is too short. Must include at least 7 digits.' };
  }

  if (digitsOnly.length > 15) {
    return { isValid: false, error: 'Phone number exceeds maximum E.164 limit of 15 digits.' };
  }

  // Normalized E.164 representation
  let normalized = hasLeadingPlus ? `+${digitsOnly}` : `+${digitsOnly}`;

  // If user didn't type leading + and country is provided, attempt default prefix
  if (!hasLeadingPlus) {
    const defaultPrefixes: Record<string, string> = {
      IN: '+91',
      US: '+1',
      CA: '+1',
      GB: '+44',
      AE: '+971',
      SA: '+966',
      AU: '+61',
      SG: '+65',
      DE: '+49',
    };
    const prefix = countryCode ? defaultPrefixes[countryCode.toUpperCase()] || '+1' : '+1';
    normalized = `${prefix}${digitsOnly}`;
  }

  // Strict E.164 check: + followed by 7 to 15 digits, first digit after + cannot be 0
  const E164_REGEX = /^\+[1-9]\d{6,14}$/;
  if (!E164_REGEX.test(normalized)) {
    return { isValid: false, error: 'Phone must adhere to international E.164 format (e.g. +14155552671 or +919876543210).' };
  }

  return { isValid: true, normalized };
}

/**
 * Customer full name validation
 */
export function validateCustomerName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Customer name is required.' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Customer name must be at least 2 characters.' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'Customer name must not exceed 100 characters.' };
  }

  // Guard against HTML tags or script injection
  if (/<[^>]*>/g.test(trimmed)) {
    return { isValid: false, error: 'Customer name contains invalid characters.' };
  }

  return { isValid: true, normalized: trimmed };
}

/**
 * Monetary amount / transaction revenue validation
 */
export function validateAmount(amount: string | number, maxAmount = 10000000): ValidationResult {
  let num: number;
  if (typeof amount === 'number') {
    num = amount;
  } else if (typeof amount === 'string') {
    const cleaned = amount.replace(/,/g, '').trim();
    num = parseFloat(cleaned);
  } else {
    return { isValid: false, error: 'Amount must be a valid number.' };
  }

  if (isNaN(num)) {
    return { isValid: false, error: 'Please enter a valid numeric amount.' };
  }

  if (num <= 0) {
    return { isValid: false, error: 'Amount must be greater than zero.' };
  }

  if (num > maxAmount) {
    return { isValid: false, error: `Amount cannot exceed ${maxAmount.toLocaleString()}.` };
  }

  return { isValid: true, normalized: num.toFixed(2) };
}

/**
 * Currency code validation against supported 27 global currencies
 */
export function validateCurrency(currencyCode: string): ValidationResult {
  if (!currencyCode || typeof currencyCode !== 'string') {
    return { isValid: false, error: 'Currency code is required.' };
  }

  const upper = currencyCode.toUpperCase();
  if (!isSupportedCurrency(upper)) {
    return {
      isValid: false,
      error: `Unsupported currency code "${currencyCode}". Must be one of the 27 supported global currencies.`,
    };
  }

  return { isValid: true, normalized: upper as SupportedCurrency };
}

/**
 * Comprehensive customer form validator
 */
export function validateCustomerForm(fields: CustomerFormFields): {
  isValid: boolean;
  errors: CustomerFormErrors;
  normalizedData?: {
    name: string;
    email: string;
    phone: string;
    country: string;
    currency: string;
    planName: string;
    planAmountCents: number;
    billingInterval: string;
  };
} {
  const errors: CustomerFormErrors = {};

  // 1. Name
  const nameRes = validateCustomerName(fields.name);
  if (!nameRes.isValid) errors.name = nameRes.error;

  // 2. Email
  const emailRes = validateEmail(fields.email);
  if (!emailRes.isValid) errors.email = emailRes.error;

  // 3. Phone (if supplied)
  const phoneRes = validatePhone(fields.phone, fields.country);
  if (!phoneRes.isValid) errors.phone = phoneRes.error;

  // 4. Currency
  if (fields.currency) {
    const currRes = validateCurrency(fields.currency);
    if (!currRes.isValid) errors.currency = currRes.error;
  }

  // 5. Plan Amount (if supplied)
  let planAmountCents = 0;
  if (fields.planAmount !== undefined && fields.planAmount !== '') {
    const amtRes = validateAmount(fields.planAmount);
    if (!amtRes.isValid) {
      errors.planAmount = amtRes.error;
    } else {
      planAmountCents = Math.round(parseFloat(amtRes.normalized!) * 100);
    }
  }

  // 6. Plan Name
  if (fields.planName && fields.planName.trim().length > 80) {
    errors.planName = 'Plan name must not exceed 80 characters.';
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    normalizedData: isValid
      ? {
          name: nameRes.normalized!,
          email: emailRes.normalized!,
          phone: phoneRes.normalized || '',
          country: fields.country || 'US',
          currency: fields.currency ? fields.currency.toUpperCase() : 'USD',
          planName: fields.planName?.trim() || 'Standard Plan',
          planAmountCents,
          billingInterval: fields.billingInterval || 'month',
        }
      : undefined,
  };
}
