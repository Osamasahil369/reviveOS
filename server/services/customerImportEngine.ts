import crypto from 'crypto';
import { db } from '../store/db.js';
import { AutopilotService } from './autopilotService.js';
import { AutopilotPolicyEngine } from './autopilotPolicyEngine.js';
import { AutonomousRecoveryEngine } from './autonomousRecoveryEngine.js';
import { RecoveryDispatchEngine } from './recoveryDispatchEngine.js';
import {
  Customer,
  Subscription,
  Invoice,
  PaymentFailure,
  RecoveryOpportunity,
  ImportColumnMapping,
  ImportValidationIssue,
  ImportValidationResult,
  ImportExecutionResult,
  ImportAuditRecord,
  ImportTemplate,
  PostImportInsights,
  BillingIntervalType,
} from '../../src/types/index.js';

export interface RawCsvParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
  warnings: string[];
}

export class CustomerImportEngine {
  public static readonly MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

  /**
   * Safe CSV Lexer & Parser supporting RFC-4180, quotes, escaped commas, newlines, and formula injection sanitization.
   */
  public static parseCsv(csvText: string): RawCsvParseResult {
    if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) {
      throw new Error('CSV file is empty. Please upload a valid CSV document with customer records.');
    }

    if (Buffer.byteLength(csvText, 'utf8') > this.MAX_FILE_SIZE_BYTES) {
      throw new Error('File size exceeds the maximum limit of 15MB.');
    }

    // Strip UTF-8 BOM if present
    const cleanText = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

    const lines: string[][] = [];
    let currentField = '';
    let currentRecord: string[] = [];
    let inQuotes = false;
    let i = 0;

    // Detect delimiter (, or ; or \t)
    const firstLine = cleanText.split(/\r\n|\n|\r/)[0] || '';
    let delimiter = ',';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    if (semiCount > commaCount && semiCount > tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semiCount) {
      delimiter = '\t';
    }

    while (i < cleanText.length) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote
            currentField += '"';
            i += 2;
            continue;
          } else {
            // End of quotes
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += char;
          i++;
          continue;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
          continue;
        } else if (char === delimiter) {
          currentRecord.push(this.sanitizeField(currentField));
          currentField = '';
          i++;
          continue;
        } else if (char === '\r') {
          if (nextChar === '\n') {
            i++;
          }
          currentRecord.push(this.sanitizeField(currentField));
          currentField = '';
          if (currentRecord.some(f => f.trim().length > 0)) {
            lines.push(currentRecord);
          }
          currentRecord = [];
          i++;
          continue;
        } else if (char === '\n') {
          currentRecord.push(this.sanitizeField(currentField));
          currentField = '';
          if (currentRecord.some(f => f.trim().length > 0)) {
            lines.push(currentRecord);
          }
          currentRecord = [];
          i++;
          continue;
        } else {
          currentField += char;
          i++;
        }
      }
    }

    if (currentField.length > 0 || currentRecord.length > 0) {
      currentRecord.push(this.sanitizeField(currentField));
      if (currentRecord.some(f => f.trim().length > 0)) {
        lines.push(currentRecord);
      }
    }

    if (lines.length === 0) {
      throw new Error('CSV file contains no valid rows.');
    }

    const rawHeaders = lines[0].map(h => h.trim());
    const headers = rawHeaders.map((h, idx) => h.length > 0 ? h : `Column_${idx + 1}`);

    const rows: Array<Record<string, string>> = [];
    const warnings: string[] = [];

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const line = lines[rowIdx];
      const rowObj: Record<string, string> = {};
      let hasData = false;

      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const headerName = headers[colIdx];
        const val = (line[colIdx] || '').trim();
        rowObj[headerName] = val;
        if (val.length > 0) hasData = true;
      }

      if (hasData) {
        rows.push(rowObj);
      }
    }

    return {
      headers,
      rows,
      totalRows: rows.length,
      warnings,
    };
  }

  /**
   * Security: CSV Injection & Formula Execution Sanitization
   * Prevents Excel/Spreadsheet execution attack vectors (=, +, -, @, \t, \r)
   */
  public static sanitizeField(val: string): string {
    if (!val) return '';
    let sanitized = val.trim();

    // Strip formula injection triggers
    if (/^[=+\-@\t\r]/.test(sanitized)) {
      // Escape by stripping or prepending quote
      sanitized = sanitized.replace(/^[=+\-@\t\r]+/, '');
    }

    // Strip HTML/script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<[^>]+>/g, '');

    return sanitized.trim();
  }

  /**
   * Automatic Column Detection via regex & fuzzy dictionary matching
   */
  public static autoDetectMapping(headers: string[]): ImportColumnMapping {
    const mapping: ImportColumnMapping = {};

    const findMatch = (patterns: RegExp[]): string | undefined => {
      for (const pattern of patterns) {
        for (const header of headers) {
          const norm = header.toLowerCase().replace(/[\s_\-]+/g, '');
          if (pattern.test(norm) || pattern.test(header.toLowerCase())) {
            return header;
          }
        }
      }
      return undefined;
    };

    mapping.email = findMatch([/^email$/, /^emailaddress$/, /^customeremail$/, /^contactemail$/, /email/]);
    mapping.customer_name = findMatch([/^customername$/, /^fullname$/, /^name$/, /^contactname$/, /^membername$/, /^clientname$/, /^client$/]);
    mapping.phone = findMatch([/^phone$/, /^phonenumber$/, /^mobile$/, /^cell$/, /^telephone$/, /^contactnumber$/, /phone/]);
    mapping.company = findMatch([/^company$/, /^companyname$/, /^organization$/, /^business$/, /^org$/]);
    mapping.subscription_status = findMatch([/^subscriptionstatus$/, /^substatus$/, /^status$/, /^accountstatus$/, /^state$/]);
    mapping.plan_name = findMatch([/^planname$/, /^plan$/, /^tier$/, /^packagename$/, /^membership$/, /^subscription$/]);
    mapping.mrr = findMatch([/^mrr$/, /^monthlyrevenue$/, /^monthlyprice$/, /^monthlyamount$/, /^monthlyfee$/, /^fee$/]);
    mapping.arr = findMatch([/^arr$/, /^annualrevenue$/, /^annualprice$/, /^annualfee$/]);
    mapping.invoice_amount = findMatch([/^invoiceamount$/, /^amountdue$/, /^dueamount$/, /^amount$/, /^lastinvoice$/]);
    mapping.last_payment_date = findMatch([/^lastpaymentdate$/, /^lastpaiddate$/, /^lastpaid$/, /^paidat$/, /^lastcharge$/]);
    mapping.next_billing_date = findMatch([/^nextbillingdate$/, /^nextcharge$/, /^renewaldate$/, /^nextpayment$/, /^rebilldate$/, /^duedate$/]);
    mapping.currency = findMatch([/^currency$/, /^currencycode$/, /^curr$/]);
    mapping.country = findMatch([/^country$/, /^countrycode$/, /^geo$/, /^location$/]);
    mapping.billing_interval = findMatch([/^billinginterval$/, /^interval$/, /^billingcycle$/, /^frequency$/]);
    mapping.external_id = findMatch([/^externalid$/, /^customerid$/, /^userid$/, /^stripecustomerid$/, /^id$/]);

    return mapping;
  }

  /**
   * Validates raw CSV rows against column mapping and existing workspace records
   */
  public static validateRows(
    workspaceId: string,
    rows: Array<Record<string, string>>,
    mapping: ImportColumnMapping
  ): ImportValidationResult {
    const workspace = db.getWorkspace(workspaceId);
    const existingCustomers = db.getCustomers(workspaceId);
    const existingEmails = new Set(existingCustomers.map(c => (c.email || '').toLowerCase().trim()));
    const existingExternalIds = new Set(existingCustomers.map(c => (c.provider_customer_id || '').toLowerCase().trim()));

    const errors: ImportValidationIssue[] = [];
    const warnings: ImportValidationIssue[] = [];
    const seenEmailsInFile = new Map<string, number>();

    const detectedCurrency = (workspace?.currency || 'USD').toUpperCase();
    let duplicateEmailsInFile = 0;
    let duplicateEmailsInWorkspace = 0;
    let missingEmails = 0;
    let invalidAmounts = 0;
    let invalidDates = 0;
    let validRowsCount = 0;
    let errorRowsCount = 0;
    let warningRowsCount = 0;

    const previewRows: Array<Record<string, any>> = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    rows.forEach((row, index) => {
      const rowNum = index + 1;
      let rowHasError = false;
      let rowHasWarning = false;

      const rawEmail = mapping.email ? row[mapping.email] : row['email'] || row['Email'] || '';
      let email = (rawEmail || '').toLowerCase().trim();

      const rawName = mapping.customer_name ? row[mapping.customer_name] : row['name'] || row['Name'] || '';
      const name = (rawName || '').trim();

      const rawPhone = mapping.phone ? row[mapping.phone] : row['phone'] || row['Phone'] || row['Mobile'] || '';
      const phone = (rawPhone || '').trim();

      const rawStatus = mapping.subscription_status ? row[mapping.subscription_status] : row['status'] || row['Status'] || 'active';
      const rawMrr = mapping.mrr ? row[mapping.mrr] : row['mrr'] || row['MRR'] || '';
      const rawInvoiceAmount = mapping.invoice_amount ? row[mapping.invoice_amount] : row['amount'] || row['Amount'] || '';
      const rawNextBillingDate = mapping.next_billing_date ? row[mapping.next_billing_date] : row['next_billing_date'] || '';
      const rawLastPaymentDate = mapping.last_payment_date ? row[mapping.last_payment_date] : row['last_payment_date'] || '';

      // If email is missing, we can support importing using phone or name by generating a UUID placeholder email
      if (!email) {
        if (!mapping.email && (phone || name)) {
          const generatedUuid = crypto.randomUUID();
          email = `imported_${generatedUuid.substring(0, 8)}@unidentified-customer.com`;
          warnings.push({
            rowNumber: rowNum,
            field: 'email',
            value: '',
            message: `Email column not mapped. Generated unique placeholder: "${email}" (imported via phone/name)`,
            type: 'warning',
          });
          rowHasWarning = true;
        } else {
          errors.push({
            rowNumber: rowNum,
            field: 'email',
            value: rawEmail,
            message: 'Email address is missing',
            type: 'error',
          });
          missingEmails++;
          rowHasError = true;
        }
      } else if (!emailRegex.test(email)) {
        errors.push({
          rowNumber: rowNum,
          field: 'email',
          value: rawEmail,
          message: `Invalid email format: "${rawEmail}"`,
          type: 'error',
        });
        missingEmails++;
        rowHasError = true;
      } else {
        // Check file duplicates
        if (seenEmailsInFile.has(email)) {
          warnings.push({
            rowNumber: rowNum,
            field: 'email',
            value: email,
            message: `Duplicate email in file (first seen at row ${seenEmailsInFile.get(email)})`,
            type: 'warning',
          });
          duplicateEmailsInFile++;
          rowHasWarning = true;
        } else {
          seenEmailsInFile.set(email, rowNum);
        }

        // Check workspace duplicates
        if (existingEmails.has(email)) {
          warnings.push({
            rowNumber: rowNum,
            field: 'email',
            value: email,
            message: 'Customer already exists in workspace (will be merged/updated)',
            type: 'warning',
          });
          duplicateEmailsInWorkspace++;
          rowHasWarning = true;
        }
      }

      // 2. Name validation
      if (!name) {
        warnings.push({
          rowNumber: rowNum,
          field: 'customer_name',
          value: rawName,
          message: 'Customer name is missing; will default to email prefix',
          type: 'warning',
        });
        rowHasWarning = true;
      }

      // 3. Currency / Amount validation
      const parseAmount = (val: string, fieldName: string) => {
        if (!val) return;
        const cleaned = val.replace(/[^0-9.-]/g, '');
        const num = parseFloat(cleaned);
        if (isNaN(num) || num < 0) {
          errors.push({
            rowNumber: rowNum,
            field: fieldName,
            value: val,
            message: `Invalid numeric amount: "${val}"`,
            type: 'error',
          });
          invalidAmounts++;
          rowHasError = true;
        }
      };

      if (rawMrr) parseAmount(rawMrr, 'mrr');
      if (rawInvoiceAmount) parseAmount(rawInvoiceAmount, 'invoice_amount');

      // 4. Date validation
      const parseDate = (val: string, fieldName: string) => {
        if (!val) return;
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          warnings.push({
            rowNumber: rowNum,
            field: fieldName,
            value: val,
            message: `Could not parse date "${val}"; will default to current date`,
            type: 'warning',
          });
          invalidDates++;
          rowHasWarning = true;
        }
      };

      if (rawNextBillingDate) parseDate(rawNextBillingDate, 'next_billing_date');
      if (rawLastPaymentDate) parseDate(rawLastPaymentDate, 'last_payment_date');

      if (rowHasError) {
        errorRowsCount++;
      } else {
        validRowsCount++;
      }
      if (rowHasWarning && !rowHasError) {
        warningRowsCount++;
      }

      // Build structured preview item (up to 50 rows)
      if (index < 50) {
        previewRows.push({
          rowNumber: rowNum,
          customer_name: name || (email ? email.split('@')[0] : 'Unknown'),
          email,
          phone: mapping.phone ? row[mapping.phone] : '',
          company: mapping.company ? row[mapping.company] : '',
          plan_name: mapping.plan_name ? row[mapping.plan_name] : 'Standard Plan',
          status: this.normalizeStatus(rawStatus),
          mrr_cents: this.parseAmountToCents(rawMrr, detectedCurrency),
          invoice_amount_cents: this.parseAmountToCents(rawInvoiceAmount || rawMrr, detectedCurrency),
          next_billing_date: this.normalizeDate(rawNextBillingDate),
          isValid: !rowHasError,
        });
      }
    });

    const summary = {
      totalRows: rows.length,
      validRowsCount,
      errorRowsCount,
      warningRowsCount,
      duplicateEmailsInFile,
      duplicateEmailsInWorkspace,
      missingEmails,
      invalidAmounts,
      invalidDates,
      currencyDetected: detectedCurrency,
    };

    return {
      isValid: errorRowsCount === 0,
      canProceed: validRowsCount > 0,
      summary,
      errors,
      warnings,
      previewRows,
      detectedHeaders: rows.length > 0 ? Object.keys(rows[0]) : [],
      suggestedMapping: mapping,
    };
  }

  /**
   * Executes the customer and subscription import into the database
   */
  public static async executeImport(
    workspaceId: string,
    rows: Array<Record<string, string>>,
    mapping: ImportColumnMapping,
    options?: {
      fileName?: string;
      deduplicationMode?: 'merge' | 'skip';
      importedByUserId?: string;
      importedByEmail?: string;
    }
  ): Promise<ImportExecutionResult> {
    const workspace = db.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const fileName = options?.fileName || `import_${new Date().toISOString().split('T')[0]}.csv`;
    const dedupeMode = options?.deduplicationMode || 'merge';
    const importedByUserId = options?.importedByUserId || 'usr_owner';
    const importedByEmail = options?.importedByEmail || 'owner@reviveos.io';
    const currency = (workspace.currency || 'USD').toUpperCase();

    const existingCustomers = db.getCustomers(workspaceId);
    const existingByEmail = new Map<string, Customer>();
    const existingByExtId = new Map<string, Customer>();

    existingCustomers.forEach((c) => {
      if (c.email) existingByEmail.set(c.email.toLowerCase().trim(), c);
      if (c.provider_customer_id) existingByExtId.set(c.provider_customer_id.toLowerCase().trim(), c);
    });

    let importedCount = 0;
    let skippedCount = 0;
    let mergedCount = 0;
    let createdSubscriptionsCount = 0;
    let createdInvoicesCount = 0;
    let createdOpportunitiesCount = 0;
    let totalImportedRevenueCents = 0;
    const executionErrors: string[] = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawEmail = mapping.email ? row[mapping.email] : row['email'] || row['Email'] || '';
      let email = (rawEmail || '').toLowerCase().trim();

      const rawName = mapping.customer_name ? row[mapping.customer_name] : row['name'] || row['Name'] || '';
      const name = (rawName || '').trim() || (email.includes('@') ? email.split('@')[0] : 'Imported Customer');

      const phone = (mapping.phone ? row[mapping.phone] : row['phone'] || row['Phone'] || row['Mobile'] || '').trim();

      if (!email) {
        if (!mapping.email && (phone || name)) {
          const generatedUuid = crypto.randomUUID();
          email = `imported_${generatedUuid.substring(0, 8)}@unidentified-customer.com`;
        } else {
          // Skip completely unidentifiable row
          continue;
        }
      }

      if (!emailRegex.test(email)) {
        // Skip invalid rows safely
        continue;
      }

      const company = mapping.company ? row[mapping.company] : '';
      const planName = (mapping.plan_name ? row[mapping.plan_name] : row['plan'] || 'Standard Plan').trim();
      const rawStatus = mapping.subscription_status ? row[mapping.subscription_status] : row['status'] || 'active';
      const status = this.normalizeStatus(rawStatus);

      const rawMrr = mapping.mrr ? row[mapping.mrr] : row['mrr'] || '';
      const rawArr = mapping.arr ? row[mapping.arr] : row['arr'] || '';
      const rawInvoiceAmount = mapping.invoice_amount ? row[mapping.invoice_amount] : row['amount'] || '';

      let mrrCents = this.parseAmountToCents(rawMrr, currency);
      if (mrrCents === 0 && rawArr) {
        const arrCents = this.parseAmountToCents(rawArr, currency);
        mrrCents = Math.round(arrCents / 12);
      }
      if (mrrCents === 0 && rawInvoiceAmount) {
        mrrCents = this.parseAmountToCents(rawInvoiceAmount, currency);
      }
      if (mrrCents === 0) {
        mrrCents = currency === 'INR' ? 200000 : 4900; // sensible baseline default if unspecified
      }

      const invoiceAmountCents = this.parseAmountToCents(rawInvoiceAmount, currency) || mrrCents;
      const rawNextBillingDate = mapping.next_billing_date ? row[mapping.next_billing_date] : '';
      const nextBillingDate = this.normalizeDate(rawNextBillingDate) || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

      const rawLastPaymentDate = mapping.last_payment_date ? row[mapping.last_payment_date] : '';
      const lastPaymentDate = this.normalizeDate(rawLastPaymentDate) || new Date().toISOString();

      const rawExtId = mapping.external_id ? row[mapping.external_id] : undefined;
      const externalId = (rawExtId || `csv_cust_${crypto.randomUUID()}`).trim();

      let customer: Customer;
      const matchedCustomer = existingByEmail.get(email) || existingByExtId.get(externalId.toLowerCase().trim());

      if (matchedCustomer) {
        if (dedupeMode === 'skip') {
          skippedCount++;
          continue;
        }

        // Merge / Update existing customer
        customer = matchedCustomer;
        customer.name = name || customer.name;
        if (phone) customer.phone = phone;
        customer.lifetime_value_cents = (customer.lifetime_value_cents || 0) + mrrCents;
        customer.current_risk_status = status === 'past_due' ? 'at_risk' : customer.current_risk_status;
        customer.updated_at = nowIso;
        mergedCount++;
      } else {
        // Create new Customer
        const newCustomerId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        customer = {
          id: newCustomerId,
          workspace_id: workspaceId,
          name,
          email,
          phone: phone || undefined,
          country: (workspace as any).country || (currency === 'INR' ? 'IN' : 'US'),
          currency,
          provider_type: 'csv_import' as any,
          provider_customer_id: externalId || newCustomerId,
          current_risk_status: status === 'past_due' ? 'at_risk' : 'healthy',
          lifetime_value_cents: mrrCents * 3,
          total_recovered_cents: 0,
          created_at: nowIso,
          updated_at: nowIso,
        };

        db.addCustomer(customer);
        existingByEmail.set(email, customer);
        if (customer.provider_customer_id) existingByExtId.set(customer.provider_customer_id.toLowerCase(), customer);
        importedCount++;
      }

      totalImportedRevenueCents += mrrCents;

      // Create Subscription
      const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const subscription: Subscription = {
        id: subId,
        workspace_id: workspaceId,
        customer_id: customer.id,
        provider_type: 'csv_import' as any,
        provider_subscription_id: `csv_sub_${Date.now()}_${i}`,
        plan_name: planName,
        amount_cents: mrrCents,
        currency,
        billing_interval: 'monthly' as BillingIntervalType,
        status: status as any,
        subscription_start_date: lastPaymentDate,
        current_period_end: nextBillingDate,
        next_billing_date: nextBillingDate,
        renewal_count: 1,
        created_at: nowIso,
        updated_at: nowIso,
      };
      db.addSubscription(subscription);
      createdSubscriptionsCount++;

      // Create Invoice
      const invId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const invoiceStatus = status === 'past_due' ? 'past_due' : 'paid';
      const invoice: Invoice = {
        id: invId,
        workspace_id: workspaceId,
        customer_id: customer.id,
        provider_type: 'csv_import' as any,
        provider_invoice_id: `csv_inv_${Date.now()}_${i}`,
        amount_cents: invoiceAmountCents,
        currency,
        status: invoiceStatus,
        due_date: nextBillingDate,
        paid_at: invoiceStatus === 'paid' ? lastPaymentDate : undefined,
        created_at: nowIso,
      } as any;
      db.addInvoice(invoice);
      createdInvoicesCount++;

      // If status is past_due / unpaid, immediately create PaymentFailure & RecoveryOpportunity!
      if (invoiceStatus === 'past_due') {
        const failureId = `fail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const failure: PaymentFailure = {
          id: failureId,
          workspace_id: workspaceId,
          customer_id: customer.id,
          invoice_id: invoice.id,
          amount_cents: invoiceAmountCents,
          currency,
          provider_type: 'csv_import' as any,
          provider_failure_code: 'card_declined',
          raw_error_message: 'Payment declined on renewal cycle',
          normalized_category: 'insufficient_funds',
          is_resolved: false,
          occurred_at: nowIso,
          created_at: nowIso,
        };
        db.addPaymentFailure(failure);

        const opp = db.createRecoveryOpportunity(workspaceId, {
          customer_id: customer.id,
          payment_failure_id: failure.id,
          amount_at_risk_cents: invoiceAmountCents,
          currency,
          failure_category: 'insufficient_funds',
          status: 'new' as any,
          customer,
          invoice,
          payment_failure: failure,
          recommended_action: '1-click recovery link & smart retry',
        });
        createdOpportunitiesCount++;

        // Autonomous policy evaluation and launch
        try {
          const autoRes = await AutonomousRecoveryEngine.processOpportunity(workspaceId, opp.id);
          if (autoRes.executed && autoRes.workflow) {
            await RecoveryDispatchEngine.dispatchWorkflow(workspaceId, autoRes.workflow.id);
          }
        } catch (autoErr) {
          console.warn('[Import Engine] Autonomous dispatch warning:', autoErr);
        }
      }
    }

    // Calculate post-import insights
    const insights = this.calculatePostImportInsights(workspaceId);

    // Create immutable audit log
    const auditRecord: ImportAuditRecord = {
      id: `imp_audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspace_id: workspaceId,
      imported_by_user_id: importedByUserId,
      imported_by_email: importedByEmail,
      file_name: fileName,
      file_size_bytes: Buffer.byteLength(JSON.stringify(rows), 'utf8'),
      total_rows: rows.length,
      rows_imported: importedCount,
      rows_skipped: skippedCount,
      rows_merged: mergedCount,
      rows_failed: executionErrors.length,
      status: executionErrors.length === 0 ? 'completed' : 'partial',
      currency,
      total_revenue_imported_cents: totalImportedRevenueCents,
      summary_json: JSON.stringify({
        createdSubscriptionsCount,
        createdInvoicesCount,
        createdOpportunitiesCount,
        insights,
      }),
      created_at: nowIso,
    };

    db.createImportAudit(auditRecord);

    const sym = currency === 'INR' ? '₹' : '$';
    const totalImportedRevenueFormatted = `${sym}${(totalImportedRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return {
      success: true,
      auditId: auditRecord.id,
      fileName,
      totalRows: rows.length,
      importedCustomersCount: importedCount,
      skippedCustomersCount: skippedCount,
      mergedCustomersCount: mergedCount,
      createdSubscriptionsCount,
      createdInvoicesCount,
      createdOpportunitiesCount,
      totalImportedRevenueCents,
      totalImportedRevenueFormatted,
      currency,
      insights,
      errors: executionErrors,
      importedAt: nowIso,
    };
  }

  /**
   * Immediately calculates high-value executive metrics after an import
   */
  public static calculatePostImportInsights(workspaceId: string): PostImportInsights {
    const workspace = db.getWorkspace(workspaceId);
    const customers = db.getCustomers(workspaceId);
    const subscriptions = db.getSubscriptions(workspaceId);
    const opportunities = db.getOpportunities(workspaceId);
    const failures = db.getPaymentFailures(workspaceId).filter(f => !f.is_resolved);

    const currency = (workspace?.currency || 'USD').toUpperCase();
    const sym = currency === 'INR' ? '₹' : '$';

    const activeCustomers = customers.filter(c => c.current_risk_status !== 'churned');
    const openOpps = opportunities.filter(o => o.status === 'active' || (o.status as any) === 'new' || (o.status as any) === 'in_recovery');

    const revenueAtRiskCents = openOpps.reduce((sum, o) => sum + (o.amount_at_risk_cents || 0), 0);
    const totalMrrCents = subscriptions
      .filter(s => s.status === 'active' || s.status === 'past_due')
      .reduce((sum, s) => sum + (s.amount_cents || 0), 0);

    return {
      revenueAtRiskCents,
      revenueAtRiskFormatted: `${sym}${(revenueAtRiskCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      activeCustomersCount: activeCustomers.length,
      failedPaymentsCount: failures.length,
      recoveryOpportunitiesCount: openOpps.length,
      totalImportedMrrCents: totalMrrCents,
      totalImportedMrrFormatted: `${sym}${(totalMrrCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      currency,
    };
  }

  /**
   * Sample templates for instant business owner onboarding
   */
  public static getSampleTemplates(): ImportTemplate[] {
    return [
      {
        id: 'saas_template',
        name: 'SaaS & Subscription Software',
        businessType: 'saas',
        description: 'Standard template for B2B/B2C recurring software subscriptions, MRR, and plan tiers.',
        filename: 'reviveos_saas_import_template.csv',
        headers: ['Customer Name', 'Email', 'Company', 'Plan', 'MRR', 'Status', 'Last Payment Date', 'Next Billing Date'],
        csvContent: `Customer Name,Email,Company,Plan,MRR,Status,Last Payment Date,Next Billing Date
Sarah Connor,sarah@cyberdyne.com,Cyberdyne Systems,Enterprise Growth,$499.00,active,2026-09-15,2026-10-15
Alex Rivera,alex@hyperion.io,Hyperion AI,Pro Monthly,$99.00,past_due,2026-08-20,2026-09-20
David Chen,david@finflow.co,FinFlow Systems,Starter,$49.00,active,2026-09-28,2026-10-28
Elena Rostova,elena@quantumscale.tech,QuantumScale,Enterprise Scale,$1250.00,past_due,2026-08-10,2026-09-10
Marcus Vance,marcus@cloudlogic.net,CloudLogic,Pro Annual,$1188.00,active,2026-01-15,2027-01-15`,
      },
      {
        id: 'gym_template',
        name: 'Fitness & Gym Memberships',
        businessType: 'fitness_gym',
        description: 'Optimized for fitness clubs, recurring memberships, member phone numbers, and overdue fees.',
        filename: 'reviveos_gym_import_template.csv',
        headers: ['Member Name', 'Email', 'Phone', 'Membership Plan', 'Monthly Fee', 'Status', 'Next Due Date'],
        csvContent: `Member Name,Email,Phone,Membership Plan,Monthly Fee,Status,Next Due Date
Aarav Sharma,aarav.sharma@pulsefit.in,+919876543210,All Access Gold,₹2500,active,2026-10-15
Pooja Patel,pooja.patel@gmail.com,+919823456789,Premium Personal Training,₹5000,past_due,2026-09-25
Rohan Verma,rohan.v@outlook.com,+919812345678,Standard Gym Membership,₹2000,active,2026-10-10
Sneha Kulkarni,sneha.k@yahoo.com,+919834567890,Yoga & Pilates Pass,₹3000,past_due,2026-09-18
Vikram Malhotra,vikram.m@corporate.in,+919845678901,Executive VIP Membership,₹7500,active,2026-10-20`,
      },
      {
        id: 'agency_template',
        name: 'Digital Agency & Retainers',
        businessType: 'agency',
        description: 'Ideal for creative agencies, consultancies, monthly retainers, and client invoices.',
        filename: 'reviveos_agency_import_template.csv',
        headers: ['Client Name', 'Email', 'Company', 'Retainer Package', 'Monthly Retainer', 'Status', 'Last Invoice Date'],
        csvContent: `Client Name,Email,Company,Retainer Package,Monthly Retainer,Status,Last Invoice Date
Jessica Alba,jessica@honestco.com,Honest Ventures,Full-Service Growth,$3500.00,active,2026-09-01
Liam Neeson,liam@takenstudios.com,Taken Media,Performance Marketing,$2000.00,past_due,2026-08-15
Chloe Bennett,chloe@shielddesign.org,Shield Creative,Brand Architecture,$5000.00,active,2026-09-10
Rajesh Gupta,rajesh@zenithglobal.com,Zenith Global,SEO & Content Engine,$1800.00,active,2026-09-20`,
      },
    ];
  }

  // ==========================================
  // HELPER NORMALIZERS
  // ==========================================

  private static normalizeStatus(rawStatus?: string): 'active' | 'past_due' | 'canceled' | 'paused' | 'trialing' {
    if (!rawStatus) return 'active';
    const s = rawStatus.toLowerCase().trim();
    if (s.includes('past') || s.includes('due') || s.includes('fail') || s.includes('unpaid') || s.includes('overdue') || s.includes('delinquent')) {
      return 'past_due';
    }
    if (s.includes('cancel') || s.includes('churn') || s.includes('terminated') || s.includes('ended')) {
      return 'canceled';
    }
    if (s.includes('pause') || s.includes('hold') || s.includes('suspend')) {
      return 'paused';
    }
    if (s.includes('trial')) {
      return 'trialing';
    }
    return 'active';
  }

  private static parseAmountToCents(rawVal?: string, currency: string = 'USD'): number {
    if (!rawVal) return 0;
    // Strip symbols like $, ₹, €, commas
    const cleaned = String(rawVal).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return 0;

    // Currency precision: USD -> cents (multiply by 100), INR -> paise (multiply by 100)
    return Math.round(num * 100);
  }

  private static normalizeDate(rawDate?: string): string | undefined {
    if (!rawDate) return undefined;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString().split('T')[0];
  }
}
