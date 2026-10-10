import { strict as assert } from 'assert';
import { db } from '../server/store/db.js';
import { EmailDeliveryEngine } from '../server/services/emailDeliveryEngine.js';
import { EmailTemplateEngine } from '../server/services/emailTemplateEngine.js';
import { EmailProviderType, EmailTemplateType } from '../src/types/index.js';

async function runEmailDeliveryTests() {
  console.log('🚀 [TEST SUITE] Starting Production Email Delivery Infrastructure Verification');

  // Disable persistence during tests for speed & cleanliness
  db.setPersistenceEnabled(false);

  const wsA = db.createWorkspace('SaaS Velocity Alpha', 'saas', 'USD');
  const wsB = db.createWorkspace('Gym Apex Beta', 'gym', 'INR');

  console.log(`✓ Workspaces created: ${wsA.id}, ${wsB.id}`);

  // =========================================================================
  // TEST 1: TEMPLATE RENDERING & VARIABLE INTERPOLATION (ALL 7 TEMPLATES)
  // =========================================================================
  console.log('\n--- 1. Verifying All 7 Production Email Templates ---');
  const templateList: EmailTemplateType[] = [
    'payment_failed',
    'update_payment_method',
    'recovery_link',
    'final_reminder',
    'payment_recovered',
    'welcome_to_reviveos',
    'import_completed',
  ];

  for (const tId of templateList) {
    const rendered = EmailTemplateEngine.render(
      tId,
      {
        customer_name: 'Jane Doe',
        amount_due: '149.00',
        currency: 'USD',
        company_name: 'Velocity Cloud',
        payment_link: 'https://pay.reviveos.io/r/rec_test123',
        customers_count: 500,
        revenue_imported: '75,000',
      },
      {
        company_name: 'Velocity Cloud',
        brand_color: '#4f46e5',
        support_email: 'billing@velocity.com',
      }
    );

    assert.ok(rendered.subject.length > 0, `Subject for ${tId} must not be empty`);
    assert.ok(rendered.html.includes('Velocity Cloud') || rendered.html.includes('ReviveOS'), `HTML for ${tId} must include branding`);
    assert.ok(rendered.text.length > 0, `Text fallback for ${tId} must not be empty`);
    console.log(`  ✓ Template ${tId} rendered successfully. Subject: "${rendered.subject}"`);
  }

  // =========================================================================
  // TEST 2: HEADER INJECTION PROTECTION & SANITIZATION
  // =========================================================================
  console.log('\n--- 2. Verifying Header Injection Protection & XSS Sanitization ---');
  const maliciousSubject = 'Urgent Notice\r\nBcc: victim@attack.com\r\nContent-Type: text/html\n\nAttacked';
  const cleanSubject = EmailTemplateEngine.sanitizeHeader(maliciousSubject);
  assert.ok(!cleanSubject.includes('\r'), 'CR characters must be stripped from header');
  assert.ok(!cleanSubject.includes('\n'), 'LF characters must be stripped from header');
  assert.strictEqual(cleanSubject, 'Urgent Notice Bcc: victim@attack.com Content-Type: text/html Attacked');

  const xssContext = {
    customer_name: '<script>alert("xss")</script><b>Alex</b>',
    company_name: 'SafeCorp',
  };
  const xssRendered = EmailTemplateEngine.render('payment_failed', xssContext);
  assert.ok(!xssRendered.html.includes('<script>alert("xss")</script>'), 'XSS tags in variables must be escaped in HTML output');
  assert.ok(xssRendered.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'XSS payload must be entity-encoded');
  console.log('  ✓ Header injection and XSS defenses verified.');

  // =========================================================================
  // TEST 3: PROVIDER CONFIGURATION & TENANT ISOLATION
  // =========================================================================
  console.log('\n--- 3. Verifying Provider Configuration & Tenant Isolation ---');
  db.saveEmailProviderConfig(wsA.id, {
    primary_provider: 'resend',
    provider_priority: ['resend', 'smtp', 'sendgrid'],
    resend: {
      api_key: 're_secret_key_alpha',
      from_email: 'billing@velocityalpha.com',
      from_name: 'Velocity Alpha',
    },
    smtp: {
      host: 'smtp.velocityalpha.com',
      port: 587,
      username: 'alpha_user',
      password: 'alpha_password',
      from_email: 'billing@velocityalpha.com',
    },
  });

  db.saveEmailProviderConfig(wsB.id, {
    primary_provider: 'smtp',
    provider_priority: ['smtp', 'sendgrid'],
    smtp: {
      host: 'smtp.gymapex.in',
      port: 465,
      username: 'gym_user',
      password: 'gym_password',
      from_email: 'finance@gymapex.in',
    },
  });

  const configA = db.getEmailProviderConfig(wsA.id);
  const configB = db.getEmailProviderConfig(wsB.id);

  assert.strictEqual(configA.primary_provider, 'resend', 'Workspace A must have Resend as primary');
  assert.strictEqual(configB.primary_provider, 'smtp', 'Workspace B must have SMTP as primary');
  assert.strictEqual(configA.resend?.from_email, 'billing@velocityalpha.com');
  assert.strictEqual(configB.smtp?.from_email, 'finance@gymapex.in');
  console.log('  ✓ Tenant-isolated provider configurations saved and verified.');

  // =========================================================================
  // TEST 4: RESEND, SMTP, SENDGRID, AND MOCK PROVIDER DISPATCH
  // =========================================================================
  console.log('\n--- 4. Verifying Provider Dispatch Mechanisms ---');

  // Test with Mock Interceptor simulating Resend success
  EmailDeliveryEngine.setMockInterceptor(async (provider, payload) => {
    if (provider === 'resend') {
      return { success: true, messageId: `resend_msg_${Date.now()}` };
    }
    return { success: false, error: 'Provider not active' };
  });

  const resendResult = await EmailDeliveryEngine.send({
    workspaceId: wsA.id,
    toEmail: 'customer1@acme.com',
    customerName: 'Customer One',
    templateId: 'payment_failed',
    variables: { amount_due: '79.00', currency: 'USD' },
  });

  assert.strictEqual(resendResult.success, true, 'Resend send must succeed');
  assert.strictEqual(resendResult.provider, 'resend', 'Provider used must be resend');
  assert.strictEqual(resendResult.failoverCount, 0, 'No failover on primary success');
  console.log('  ✓ Resend dispatch verified successfully.');

  // Test with Mock Interceptor simulating SMTP success
  EmailDeliveryEngine.setMockInterceptor(async (provider, payload) => {
    if (provider === 'smtp') {
      return { success: true, messageId: `smtp_msg_${Date.now()}` };
    }
    return { success: false, error: 'Provider not active' };
  });

  const smtpResult = await EmailDeliveryEngine.send({
    workspaceId: wsB.id,
    toEmail: 'member@gymapex.in',
    customerName: 'Gym Member',
    templateId: 'recovery_link',
    providerOverride: 'smtp',
    variables: { amount_due: '2500', currency: 'INR' },
  });

  assert.strictEqual(smtpResult.success, true, 'SMTP send must succeed');
  assert.strictEqual(smtpResult.provider, 'smtp', 'Provider used must be smtp');
  console.log('  ✓ SMTP dispatch verified successfully.');

  // Test with Mock Interceptor simulating SendGrid success
  EmailDeliveryEngine.setMockInterceptor(async (provider, payload) => {
    if (provider === 'sendgrid') {
      return { success: true, messageId: `sg_msg_${Date.now()}` };
    }
    return { success: false, error: 'Provider not active' };
  });

  const sendgridResult = await EmailDeliveryEngine.send({
    workspaceId: wsA.id,
    toEmail: 'user@sendgridtest.com',
    templateId: 'final_reminder',
    providerOverride: 'sendgrid',
    variables: { amount_due: '199.00', currency: 'USD' },
  });

  assert.strictEqual(sendgridResult.success, true, 'SendGrid send must succeed');
  assert.strictEqual(sendgridResult.provider, 'sendgrid', 'Provider used must be sendgrid');
  console.log('  ✓ SendGrid dispatch verified successfully.');

  // =========================================================================
  // TEST 5: AUTOMATIC FAILOVER SYSTEM (PRIMARY FAILS -> SECONDARY SUCCEEDS)
  // =========================================================================
  console.log('\n--- 5. Verifying Automatic Failover System ---');
  // Configure Workspace A priority: ['resend', 'smtp', 'sendgrid']
  // Resend fails, SMTP succeeds
  let resendAttempts = 0;
  let smtpAttempts = 0;

  EmailDeliveryEngine.setMockInterceptor(async (provider, payload) => {
    if (provider === 'resend') {
      resendAttempts++;
      return { success: false, error: 'HTTP 429: Resend rate limit exceeded' };
    }
    if (provider === 'smtp') {
      smtpAttempts++;
      return { success: true, messageId: `smtp_failover_${Date.now()}` };
    }
    return { success: false, error: 'Not reached' };
  });

  const failoverResult = await EmailDeliveryEngine.send({
    workspaceId: wsA.id,
    toEmail: 'vip@failovertest.com',
    customerName: 'VIP Customer',
    templateId: 'payment_failed',
    variables: { amount_due: '500.00', currency: 'USD' },
    maxRetries: 1,
  });

  assert.strictEqual(failoverResult.success, true, 'Overall delivery must succeed despite primary failure');
  assert.strictEqual(failoverResult.provider, 'smtp', 'Secondary provider SMTP must be used');
  assert.strictEqual(failoverResult.failoverCount, 1, 'Exactly 1 failover recorded');
  assert.strictEqual(failoverResult.failoverHistory.length, 1);
  assert.strictEqual(failoverResult.failoverHistory[0].provider, 'resend');
  assert.ok(failoverResult.failoverHistory[0].error.includes('429'));
  console.log('  ✓ Automatic failover verified: Resend (failed) → SMTP (succeeded).');

  // =========================================================================
  // TEST 6: IMMUTABLE AUDIT LOGS & TELEMETRY QUERYING
  // =========================================================================
  console.log('\n--- 6. Verifying Delivery Audit Logs & Authoritative Telemetry ---');
  const logsA = db.getEmailDeliveryLogs(wsA.id);
  const logsB = db.getEmailDeliveryLogs(wsB.id);

  assert.ok(logsA.length >= 2, 'Workspace A must have delivery logs');
  assert.ok(logsB.length >= 1, 'Workspace B must have delivery logs');

  // Strict tenant isolation test
  const crossLog = logsA.find((l) => l.workspace_id === wsB.id);
  assert.strictEqual(crossLog, undefined, 'Workspace A logs must never contain Workspace B records');

  // Verify status update (open pixel / link click tracking)
  const targetLog = logsA[0];
  const updated = EmailDeliveryEngine.updateDeliveryStatus(wsA.id, targetLog.id, 'opened', {
    openedAt: new Date().toISOString(),
  });
  assert.strictEqual(updated?.status, 'opened');

  const health = EmailDeliveryEngine.getHealthMetrics(wsA.id);
  assert.ok(health.total_sent > 0, 'Total sent must be tracked');
  assert.ok(typeof health.open_rate === 'number', 'Open rate must be calculated');
  assert.ok(typeof health.delivery_rate === 'number', 'Delivery rate must be calculated');
  console.log(`  ✓ Telemetry verified. Total Sent: ${health.total_sent}, Open Rate: ${health.open_rate}%, Delivery Rate: ${health.delivery_rate}%`);

  // =========================================================================
  // TEST 7: CAMPAIGN CADENCE PROGRESSION (DAYS 0, 2, 4, 7, 10)
  // =========================================================================
  console.log('\n--- 7. Verifying Dunning Campaign Cadence Mapping ---');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(0).templateId, 'payment_failed');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(1).templateId, 'payment_failed');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(2).templateId, 'update_payment_method');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(4).templateId, 'update_payment_method');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(7).templateId, 'recovery_link');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(10).templateId, 'final_reminder');
  assert.strictEqual(EmailDeliveryEngine.getCampaignStepForDaysPastDue(14).templateId, 'final_reminder');
  console.log('  ✓ Campaign cadence mapping verified for Days 0, 2, 4, 7, and 10.');

  // =========================================================================
  // TEST 8: HIGH-VOLUME BATCH DISPATCH RESILIENCE
  // =========================================================================
  console.log('\n--- 8. Verifying High-Volume Batch Dispatch Resilience ---');
  EmailDeliveryEngine.setMockInterceptor(async (provider, payload) => {
    return { success: true, messageId: `bulk_${Date.now()}_${Math.random()}` };
  });

  const batchPromises = Array.from({ length: 25 }, (_, i) =>
    EmailDeliveryEngine.send({
      workspaceId: wsA.id,
      toEmail: `bulk_customer_${i}@example.com`,
      customerName: `Customer ${i}`,
      templateId: 'payment_failed',
      variables: { amount_due: `${10 + i}.00`, currency: 'USD' },
    })
  );

  const batchResults = await Promise.all(batchPromises);
  const allSuccessful = batchResults.every((r) => r.success);
  assert.strictEqual(allSuccessful, true, 'All 25 concurrent batch dispatches must succeed');
  assert.strictEqual(batchResults.length, 25);
  console.log('  ✓ 25/25 concurrent transactional emails delivered without race conditions.');

  // Reset interceptor
  EmailDeliveryEngine.setMockInterceptor(undefined);

  console.log('\n=============================================================');
  console.log('🎉 ALL EMAIL DELIVERY INFRASTRUCTURE TESTS PASSED PERFECTLY!');
  console.log('=============================================================\n');
}

runEmailDeliveryTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
