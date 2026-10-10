import { getSupabaseServerClient } from '../db/supabaseClient.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { SUPPORTED_CURRENCIES } from './validator.js';

export interface CsvValidationResult {
  validRows: Array<{
    rowNumber: number;
    name: string;
    email: string;
    phone?: string;
    amount: number;
    currency: string;
    invoice_id: string;
    provider: 'stripe' | 'razorpay' | 'paypal';
    subscription_type: 'monthly' | 'annual';
    failure_reason: string;
    error_message: string;
    next_billing_date: string;
  }>;
  errors: Array<{
    rowNumber: number;
    name?: string;
    email?: string;
    phone?: string;
    amount?: number | string;
    currency?: string;
    field?: string;
    error: string;
  }>;
  duplicates: Array<{
    rowNumber: number;
    name?: string;
    email?: string;
    phone?: string;
    amount?: number | string;
    invoice_id?: string;
    reason: string;
  }>;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicatesCount: number;
}

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export async function validateCsvRowsAuthoritative(
  workspaceId: string,
  rows: any[],
  defaultCountry: string = 'US',
  mappings?: Record<string, string>
): Promise<CsvValidationResult> {
  const validRows: CsvValidationResult['validRows'] = [];
  const errors: CsvValidationResult['errors'] = [];
  const duplicates: CsvValidationResult['duplicates'] = [];

  const seenEmailsInFile = new Set<string>();

  const getVal = (row: any, mapKey: string, fallbacks: string[]): string => {
    if (mappings && mappings[mapKey] && row[mappings[mapKey]] !== undefined && row[mappings[mapKey]] !== null) {
      return String(row[mappings[mapKey]]).trim();
    }
    for (const fb of fallbacks) {
      if (row[fb] !== undefined && row[fb] !== null && String(row[fb]).trim() !== '') {
        return String(row[fb]).trim();
      }
    }
    return '';
  };

  // Fetch existing customer emails and invoice IDs from Supabase if authoritative
  const existingCustomerEmails = new Set<string>();
  const existingInvoiceIds = new Set<string>();

  if (isSupabaseAuthoritative()) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const [{ data: custData }, { data: invData }] = await Promise.all([
        supabase.from('customers').select('email').eq('workspace_id', workspaceId),
        supabase.from('invoices').select('provider_invoice_id').eq('workspace_id', workspaceId),
      ]);

      (custData || []).forEach((c: { email: string }) => {
        if (c.email) existingCustomerEmails.add(c.email.toLowerCase().trim());
      });
      (invData || []).forEach((i: { provider_invoice_id: string }) => {
        if (i.provider_invoice_id) existingInvoiceIds.add(i.provider_invoice_id.trim());
      });
    }
  }

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const name = getVal(row, 'name', ['name', 'Name', 'Customer Name', 'customer_name', 'full_name']);
    const rawEmail = getVal(row, 'email', ['email', 'Email', 'Customer Email', 'customer_email']);
    const phone = getVal(row, 'phone', ['phone', 'Phone', 'Phone Number', 'customer_phone']);
    const rawAmount = getVal(row, 'amount', ['amount', 'Amount', 'Invoice Amount', 'due_amount', 'amount_due']);
    const rawCurrency = getVal(row, 'currency', ['currency', 'Currency']);
    const invoiceId = getVal(row, 'invoice_id', ['invoice_id', 'Invoice ID', 'invoice', 'Invoice #']) || `inv_csv_${rowNum}_${Date.now()}`;
    const rawProvider = getVal(row, 'provider', ['provider', 'Provider', 'gateway']) || 'stripe';

    // 1. Mandatory Field Checks
    if (!name) {
      errors.push({ rowNumber: rowNum, error: 'Customer Name is required', field: 'name' });
      return;
    }
    if (!rawEmail) {
      errors.push({ rowNumber: rowNum, name, error: 'Customer Email is required', field: 'email' });
      return;
    }

    // 2. RFC-5322 Email Validation
    const cleanEmail = rawEmail.toLowerCase().trim();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      errors.push({
        rowNumber: rowNum,
        name,
        email: rawEmail,
        error: `Invalid email address format: "${rawEmail}"`,
        field: 'email',
      });
      return;
    }

    // 3. Amount Validation (Positive Non-Zero)
    const parsedAmount = parseFloat(rawAmount.replace(/[^0-9.-]+/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.push({
        rowNumber: rowNum,
        name,
        email: cleanEmail,
        amount: rawAmount,
        error: 'Amount must be a positive number greater than 0',
        field: 'amount',
      });
      return;
    }

    // 4. Currency Whitelist
    const cleanCurrency = (rawCurrency || 'USD').toUpperCase().trim();
    if (!SUPPORTED_CURRENCIES.includes(cleanCurrency as any)) {
      errors.push({
        rowNumber: rowNum,
        name,
        email: cleanEmail,
        currency: rawCurrency,
        error: `Unsupported currency "${rawCurrency}". Must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
        field: 'currency',
      });
      return;
    }

    // 5. In-File Duplicate Detection
    if (seenEmailsInFile.has(cleanEmail)) {
      duplicates.push({
        rowNumber: rowNum,
        name,
        email: cleanEmail,
        amount: parsedAmount,
        reason: 'Duplicate email detected in CSV file upload',
      });
      return;
    }
    seenEmailsInFile.add(cleanEmail);

    // 6. Database Duplicate Detection
    if (existingInvoiceIds.has(invoiceId)) {
      duplicates.push({
        rowNumber: rowNum,
        name,
        email: cleanEmail,
        invoice_id: invoiceId,
        amount: parsedAmount,
        reason: `Invoice ID "${invoiceId}" already exists in workspace`,
      });
      return;
    }

    // 7. Provider normalisation
    let provider: 'stripe' | 'razorpay' | 'paypal' = 'stripe';
    const lowerProv = rawProvider.toLowerCase();
    if (lowerProv.includes('razor')) provider = 'razorpay';
    else if (lowerProv.includes('paypal')) provider = 'paypal';

    const subscriptionType = (
      getVal(row, 'subscription_type', ['subscription_type', 'interval', 'plan_interval']).toLowerCase() === 'annual'
        ? 'annual'
        : 'monthly'
    ) as 'monthly' | 'annual';
    const failureReason =
      getVal(row, 'failure_reason', ['failure_reason', 'reason', 'decline_code', 'error_code']) || 'insufficient_funds';
    const errorMessage =
      getVal(row, 'error_message', ['error_message', 'message', 'error']) || `Card decline: ${failureReason}`;
    const nextBillingDate =
      getVal(row, 'next_billing_date', ['next_billing_date', 'renewal_date']) ||
      new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    validRows.push({
      rowNumber: rowNum,
      name,
      email: cleanEmail,
      phone: phone || undefined,
      amount: parsedAmount,
      currency: cleanCurrency,
      invoice_id: invoiceId,
      provider,
      subscription_type: subscriptionType,
      failure_reason: failureReason,
      error_message: errorMessage,
      next_billing_date: nextBillingDate,
    });
  });

  return {
    validRows,
    errors,
    duplicates,
    totalRows: rows.length,
    validCount: validRows.length,
    invalidCount: errors.length,
    duplicatesCount: duplicates.length,
  };
}
