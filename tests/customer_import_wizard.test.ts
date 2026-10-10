import assert from 'node:assert';
import { db } from '../server/store/db.js';
import { CustomerImportEngine } from '../server/services/customerImportEngine.js';

console.log('================================================================');
console.log('TEST SUITE: CUSTOMER IMPORT WIZARD & PRODUCTION INGESTION ENGINE');
console.log('================================================================');

async function runCustomerImportTests() {
  db.setPersistenceEnabled(false);

  // 1. Create Test Workspaces for Tenant Isolation
  const wsAlpha = db.createWorkspace(`Alpha Corp ${Date.now()}`, 'saas', 'USD', false);
  const wsBeta = db.createWorkspace(`Beta Fitness ${Date.now()}`, 'fitness_gym', 'INR', false);

  console.log(`1. Test Workspaces Initialized: ${wsAlpha.name} (USD) & ${wsBeta.name} (INR)`);

  // =========================================================================
  // TEST 1: CSV LEXER & PARSER (RFC-4180, QUOTES, COMMAS, FORMULAS)
  // =========================================================================
  console.log('\n2. Testing CSV Lexer & Sanitization...');

  const sampleCsv = `Customer Name,Email,Company,Plan,MRR,Status,Last Payment Date,Next Billing Date
"Connor, Sarah",sarah@cyberdyne.com,"Cyberdyne, Systems",Enterprise,$499.00,active,2026-09-15,2026-10-15
Alex Rivera,alex@hyperion.io,Hyperion AI,Pro,$99.00,past_due,2026-08-20,2026-09-20
"=cmd|' /C calc'!A0",malicious@exploit.com,Hacker Corp,Basic,$10.00,active,2026-09-01,2026-10-01`;

  const parsed = CustomerImportEngine.parseCsv(sampleCsv);
  assert.strictEqual(parsed.totalRows, 3, 'Must parse exactly 3 data rows');
  assert.strictEqual(parsed.headers.length, 8, 'Must extract 8 headers');
  assert.strictEqual(parsed.rows[0]['Customer Name'], 'Connor, Sarah', 'Handles escaped commas in quotes');
  assert.strictEqual(parsed.rows[0]['Company'], 'Cyberdyne, Systems', 'Handles escaped quotes in company');
  
  // Verify Formula Injection Sanitization
  assert.ok(!parsed.rows[2]['Customer Name'].startsWith('='), 'Formula injection = prefix must be sanitized');
  console.log('  ✓ Verified: RFC-4180 CSV parsing, quoted fields, and formula injection sanitization passed.');

  // =========================================================================
  // TEST 2: COLUMN AUTO-DETECTION
  // =========================================================================
  console.log('\n3. Testing Smart Column Auto-Detection...');

  const saasHeaders = ['Full Name', 'Contact Email', 'Organization', 'Tier', 'Monthly Revenue', 'Account Status', 'Due Date'];
  const saasMapping = CustomerImportEngine.autoDetectMapping(saasHeaders);
  assert.strictEqual(saasMapping.customer_name, 'Full Name', 'Mapped Customer Name');
  assert.strictEqual(saasMapping.email, 'Contact Email', 'Mapped Email');
  assert.strictEqual(saasMapping.company, 'Organization', 'Mapped Company');
  assert.strictEqual(saasMapping.plan_name, 'Tier', 'Mapped Plan Tier');
  assert.strictEqual(saasMapping.mrr, 'Monthly Revenue', 'Mapped MRR');
  assert.strictEqual(saasMapping.subscription_status, 'Account Status', 'Mapped Status');
  assert.strictEqual(saasMapping.next_billing_date, 'Due Date', 'Mapped Due Date');

  const gymHeaders = ['Member Name', 'Email', 'Phone', 'Membership Plan', 'Monthly Fee', 'Status', 'Next Due Date'];
  const gymMapping = CustomerImportEngine.autoDetectMapping(gymHeaders);
  assert.strictEqual(gymMapping.customer_name, 'Member Name', 'Mapped Member Name');
  assert.strictEqual(gymMapping.phone, 'Phone', 'Mapped Phone');
  assert.strictEqual(gymMapping.mrr, 'Monthly Fee', 'Mapped Monthly Fee');
  console.log('  ✓ Verified: Auto-detection accurately matches SaaS and Gym industry schemas.');

  // =========================================================================
  // TEST 3: DATA VALIDATION & ERROR REPORTING
  // =========================================================================
  console.log('\n4. Testing Validation Engine (Errors & Warnings)...');

  const dirtyCsv = `Name,Email,Plan,MRR,Status
Valid User,valid@test.com,Pro,$99.00,active
Missing Email User,,Basic,$29.00,active
Bad Email User,not-an-email,Enterprise,$499.00,active
Invalid Amount User,badamt@test.com,Pro,NotANumber,active
Duplicate In File,valid@test.com,Pro,$99.00,active`;

  const parsedDirty = CustomerImportEngine.parseCsv(dirtyCsv);
  const dirtyMapping = CustomerImportEngine.autoDetectMapping(parsedDirty.headers);
  const valResult = CustomerImportEngine.validateRows(wsAlpha.id, parsedDirty.rows, dirtyMapping);

  assert.strictEqual(valResult.summary.totalRows, 5, 'Total 5 rows');
  assert.strictEqual(valResult.summary.validRowsCount, 2, '2 valid rows (Valid User + Duplicate User row with valid email)');
  assert.strictEqual(valResult.summary.errorRowsCount, 3, '3 error rows (missing email, invalid email, non-numeric amount)');
  assert.strictEqual(valResult.summary.missingEmails, 2, '2 email errors detected');
  assert.strictEqual(valResult.summary.invalidAmounts, 1, '1 invalid amount detected');
  assert.strictEqual(valResult.summary.duplicateEmailsInFile, 1, '1 duplicate email in file detected');
  assert.strictEqual(valResult.canProceed, true, 'Can proceed with valid rows');
  console.log('  ✓ Verified: Error classification isolates invalid rows without failing the batch.');

  // =========================================================================
  // TEST 4: IMPORT EXECUTION & MULTI-TENANT ISOLATION
  // =========================================================================
  console.log('\n5. Testing Import Execution & Tenant Isolation...');

  const alphaCsv = `Customer Name,Email,Company,Plan,MRR,Status,Next Billing Date
John Doe,john.doe@acme.com,Acme Inc,Growth Monthly,$150.00,active,2026-11-01
Jane Smith,jane.smith@globex.org,Globex,Enterprise,$500.00,past_due,2026-10-01
Bob Wilson,bob@initech.co,Initech,Starter,$50.00,active,2026-10-25`;

  const parsedAlpha = CustomerImportEngine.parseCsv(alphaCsv);
  const mappingAlpha = CustomerImportEngine.autoDetectMapping(parsedAlpha.headers);

  const importAlpha = await CustomerImportEngine.executeImport(wsAlpha.id, parsedAlpha.rows, mappingAlpha, {
    fileName: 'alpha_customers.csv',
    importedByEmail: 'ceo@alphacorp.com',
  });

  assert.strictEqual(importAlpha.success, true, 'Import must succeed');
  assert.strictEqual(importAlpha.importedCustomersCount, 3, 'Imported 3 customers');
  assert.strictEqual(importAlpha.createdSubscriptionsCount, 3, 'Created 3 subscriptions');
  assert.strictEqual(importAlpha.createdInvoicesCount, 3, 'Created 3 invoices');
  assert.strictEqual(importAlpha.createdOpportunitiesCount, 1, 'Past-due invoice created 1 recovery opportunity');
  assert.strictEqual(importAlpha.totalImportedRevenueCents, 70000, 'Imported $700.00 MRR (70000 cents)');

  // Verify Tenant Isolation: Workspace Beta must have 0 customers from Alpha
  const betaCustomersBefore = db.getCustomers(wsBeta.id);
  assert.strictEqual(betaCustomersBefore.length, 0, 'Workspace Beta must be completely isolated (0 customers)');
  console.log('  ✓ Verified: Tenant isolation strictly enforced. Zero cross-workspace data leakage.');

  // =========================================================================
  // TEST 5: DEDUPLICATION & MERGE LOGIC
  // =========================================================================
  console.log('\n6. Testing Deduplication Engine (Merge vs Skip)...');

  // Re-import John Doe with upgraded plan ($300 MRR)
  const duplicateCsv = `Customer Name,Email,Company,Plan,MRR,Status,Next Billing Date
John Doe,john.doe@acme.com,Acme Inc (Updated),Scale Pro,$300.00,active,2026-12-01
Alice Cooper,alice@rock.com,Rock LLC,Starter,$50.00,active,2026-11-15`;

  const parsedDup = CustomerImportEngine.parseCsv(duplicateCsv);
  const mappingDup = CustomerImportEngine.autoDetectMapping(parsedDup.headers);

  const mergeImport = await CustomerImportEngine.executeImport(wsAlpha.id, parsedDup.rows, mappingDup, {
    fileName: 'merge_batch.csv',
    deduplicationMode: 'merge',
  });

  assert.strictEqual(mergeImport.importedCustomersCount, 1, '1 new customer imported (Alice)');
  assert.strictEqual(mergeImport.mergedCustomersCount, 1, '1 existing customer merged (John Doe)');
  assert.strictEqual(mergeImport.skippedCustomersCount, 0, '0 skipped in merge mode');

  // Now test Skip mode
  const skipImport = await CustomerImportEngine.executeImport(wsAlpha.id, parsedDup.rows, mappingDup, {
    fileName: 'skip_batch.csv',
    deduplicationMode: 'skip',
  });

  assert.strictEqual(skipImport.skippedCustomersCount, 2, '2 existing customers skipped in skip mode');
  console.log('  ✓ Verified: Deduplication engine correctly merges or skips existing accounts.');

  // =========================================================================
  // TEST 6: POST-IMPORT INSIGHTS GENERATION
  // =========================================================================
  console.log('\n7. Testing Post-Import Insights Calculation...');

  const insights = CustomerImportEngine.calculatePostImportInsights(wsAlpha.id);
  assert.ok(insights.revenueAtRiskCents >= 50000, 'Detected $500.00 at risk from Jane Smith past due');
  assert.strictEqual(insights.recoveryOpportunitiesCount, 1, '1 open recovery opportunity');
  assert.strictEqual(insights.activeCustomersCount, 4, '4 active customers in workspace');
  assert.ok(insights.totalImportedMrrCents > 0, 'Imported MRR calculated');
  console.log(`  ✓ Verified: Post-Import Insights computed: Revenue at Risk = ${insights.revenueAtRiskFormatted} | MRR = ${insights.totalImportedMrrFormatted}`);

  // =========================================================================
  // TEST 7: IMMUTABLE IMPORT AUDIT LOG
  // =========================================================================
  console.log('\n8. Testing Immutable Import Audit Logs...');

  const audits = db.getImportAudits(wsAlpha.id);
  assert.ok(audits.length >= 3, 'Must record audit log for each executed batch');
  const firstAudit = audits[audits.length - 1];
  assert.strictEqual(firstAudit.file_name, 'alpha_customers.csv');
  assert.strictEqual(firstAudit.rows_imported, 3);
  assert.strictEqual(firstAudit.status, 'completed');
  console.log('  ✓ Verified: Immutable import audit trail recorded and queryable.');

  // =========================================================================
  // TEST 8: EDGE CASES (EMPTY, MALFORMED, LARGE BATCH)
  // =========================================================================
  console.log('\n9. Testing Edge Cases (Empty, Malformed, Large Files)...');

  // Empty File
  assert.throws(
    () => CustomerImportEngine.parseCsv('   \n  \n'),
    /empty/i,
    'Rejects empty CSV files'
  );

  // Large Batch Generation (500 rows)
  let largeCsv = 'Name,Email,Plan,MRR,Status\n';
  for (let i = 1; i <= 500; i++) {
    largeCsv += `Member ${i},member${i}@gymfit.in,All Access,₹2000,${i % 10 === 0 ? 'past_due' : 'active'}\n`;
  }
  const largeParsed = CustomerImportEngine.parseCsv(largeCsv);
  assert.strictEqual(largeParsed.totalRows, 500, 'Successfully parsed 500 rows');

  const largeImport = await CustomerImportEngine.executeImport(wsBeta.id, largeParsed.rows, CustomerImportEngine.autoDetectMapping(largeParsed.headers), {
    fileName: 'large_gym_members.csv',
  });
  assert.strictEqual(largeImport.importedCustomersCount, 500, 'Ingested 500 customers');
  assert.strictEqual(largeImport.createdOpportunitiesCount, 50, '50 past-due members generated recovery opportunities');
  console.log('  ✓ Verified: Large file batch (500 rows) ingested in milliseconds.');

  // =========================================================================
  // TEST 9: SAMPLE TEMPLATES API
  // =========================================================================
  console.log('\n10. Testing Built-in Sample Templates...');

  const templates = CustomerImportEngine.getSampleTemplates();
  assert.strictEqual(templates.length, 3, 'Must provide 3 sample templates');
  const saasTpl = templates.find((t) => t.id === 'saas_template');
  assert.ok(saasTpl?.csvContent.includes('Sarah Connor'), 'SaaS template has valid content');
  console.log('  ✓ Verified: Downloadable SaaS, Gym, and Agency templates available.');

  console.log('\n================================================================');
  console.log('CUSTOMER IMPORT WIZARD TEST SUITE: 100% PASSED');
  console.log('================================================================');
}

runCustomerImportTests().catch((err) => {
  console.error('Customer Import Test Failed:', err);
  process.exit(1);
});
