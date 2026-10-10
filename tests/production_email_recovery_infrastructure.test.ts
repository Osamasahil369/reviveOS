import { strict as assert } from 'assert';
import { db } from '../server/store/db.js';
import { EmailDeliveryEngine } from '../server/services/emailDeliveryEngine.js';
import { EmailTemplateEngine } from '../server/services/emailTemplateEngine.js';
import {
  EmailProviderRegistry,
  resolveMerchantIdentity,
  IEmailProvider,
  ProviderSendParams,
  ProviderSendResult,
  ProviderVerificationResult,
} from '../server/services/emailProviderService.js';
import {
  RecoveryEmailEngine,
  RECOVERY_SEQUENCE_STEPS,
} from '../server/services/recoveryEmailEngine.js';
import { EmailProviderConfig, RecoveryOpportunity } from '../src/types/index.js';

async function runProductionEmailRecoveryTests() {
  console.log('🚀 [REVIVEOS TEST SUITE] Starting Production Email Recovery Infrastructure Verification\n');

  // Disable persistence during tests for speed & cleanliness
  db.setPersistenceEnabled(false);

  // Setup 2 distinct tenant workspaces
  const wsAcme = db.createWorkspace('Acme Fitness Global ' + Date.now(), 'saas_recurring', 'USD', false);
  const wsBeta = db.createWorkspace('Beta Supplements India ' + Date.now(), 'ecommerce', 'INR', false);

  const wsA = wsAcme.id;
  const wsB = wsBeta.id;

  console.log(`✓ Multi-tenant workspaces initialized: wsA=${wsA}, wsB=${wsB}`);

  // =========================================================================
  // 1. EMAIL PROVIDER LAYER (SMTP, RESEND, SENDGRID, SES, PLUGGABLE EXTENSION)
  // =========================================================================
  console.log('\n--- 1. Testing Email Provider Layer & Pluggable Registry ---');

  // Verify all 4 required built-in providers are registered
  assert.ok(EmailProviderRegistry.isRegistered('smtp'), 'SMTP provider must be registered');
  assert.ok(EmailProviderRegistry.isRegistered('resend'), 'Resend provider must be registered');
  assert.ok(EmailProviderRegistry.isRegistered('sendgrid'), 'SendGrid provider must be registered');
  assert.ok(EmailProviderRegistry.isRegistered('ses'), 'Amazon SES provider must be registered');
  assert.ok(EmailProviderRegistry.isRegistered('mock'), 'Mock/Sandbox provider must be registered');

  const allProviders = EmailProviderRegistry.getAll();
  assert.ok(allProviders.length >= 5, 'Should have at least 5 registered providers');

  // Test pluggable extension: Register a custom 3P provider (e.g. Postmark / Mailgun)
  class CustomPostmarkProvider implements IEmailProvider {
    readonly type = 'custom' as any;
    readonly name = 'Postmark Universal';
    isConfigured(): boolean {
      return true;
    }
    async send(params: ProviderSendParams): Promise<ProviderSendResult> {
      return { messageId: `msg_custom_postmark_${Date.now()}` };
    }
    async verify(): Promise<ProviderVerificationResult> {
      return { verified: true, status: 'connected' };
    }
  }

  EmailProviderRegistry.register(new CustomPostmarkProvider());
  assert.ok(EmailProviderRegistry.isRegistered('custom' as any), 'Pluggable provider registry must support custom extensions');
  console.log('  ✓ SMTP, Resend, SendGrid, Amazon SES, and pluggable extension registry verified.');

  // =========================================================================
  // 2. WORKSPACE EMAIL CONFIGURATION & WHITE-LABEL CRITICAL RULE DEFENSE
  // =========================================================================
  console.log('\n--- 2. Testing Workspace Email Configuration & Anti-Branding Defense ---');

  // Workspace A: Acme Fitness
  const savedConfigA = db.saveEmailProviderConfig(wsA, {
    primary_provider: 'smtp',
    business_name: 'Acme Fitness',
    from_name: 'Acme Fitness Billing',
    sender_address: 'billing@acmefitness.com',
    reply_to_address: 'support@acmefitness.com',
    smtp: {
      host: 'smtp.acmefitness.com',
      port: 587,
      username: 'acme_smtp_user',
      from_email: 'billing@acmefitness.com',
    },
    ses: {
      region: 'us-east-1',
      smtp_username: 'AKIA_ACME_FITNESS',
      from_email: 'billing@acmefitness.com',
    },
  });

  assert.strictEqual(savedConfigA.business_name, 'Acme Fitness');
  assert.strictEqual(savedConfigA.sender_address, 'billing@acmefitness.com');

  // Anti-branding defense test:
  // If an unconfigured or malicious config attempts to use ReviveOS branding, resolveMerchantIdentity must PURGE it
  const rogueConfig: EmailProviderConfig = {
    primary_provider: 'resend',
    provider_priority: ['resend'],
    business_name: 'Acme Fitness',
    sender_address: 'reviveos@acmefitness.com',
    reply_to_address: 'support@reviveos.io',
  };
  const resolvedIdentity = resolveMerchantIdentity(rogueConfig, 'Acme Fitness');
  assert.ok(!resolvedIdentity.senderAddress.toLowerCase().includes('reviveos'), 'Sender address must never contain reviveos branding');
  assert.ok(!resolvedIdentity.replyToAddress.toLowerCase().includes('reviveos'), 'Reply-To address must never contain reviveos branding');
  assert.strictEqual(resolvedIdentity.businessName, 'Acme Fitness');
  console.log('  ✓ Workspace email configuration and strict anti-branding defense verified.');

  // =========================================================================
  // 3. SENDER OWNERSHIP VERIFICATION
  // =========================================================================
  console.log('\n--- 3. Testing Email Verification Status (Connected, Pending, Failed) ---');

  const verificationResult = await EmailDeliveryEngine.verifySenderOwnership(wsA);
  assert.ok(['connected', 'pending_verification', 'failed'].includes(verificationResult.status), 'Status must be connected, pending_verification, or failed');

  const updatedConfigA = db.getEmailProviderConfig(wsA);
  assert.strictEqual(updatedConfigA.verification_status, verificationResult.status);
  console.log(`  ✓ Sender ownership verification returned status: "${verificationResult.status}"`);

  // =========================================================================
  // 4 & 5. DYNAMIC TEMPLATES & VARIABLES (Customer Name, Invoice Amount, Due Date, Recovery Link, Business Name)
  // =========================================================================
  console.log('\n--- 4. Testing Dynamic Template Rendering & Interpolation ---');

  const dynamicContext = {
    customer_name: 'Sarah Connor',
    invoice_amount: '$149.00',
    due_date: 'Oct 15, 2026',
    recovery_link: 'https://pay.acmefitness.com/checkout/rec_token_123',
    business_name: 'Acme Fitness',
    company_name: 'Acme Fitness',
    currency: 'USD',
    amount_due: '149.00',
  };

  for (const stepDef of RECOVERY_SEQUENCE_STEPS) {
    const rendered = EmailTemplateEngine.render(stepDef.templateId, dynamicContext, {
      company_name: 'Acme Fitness',
      support_email: 'billing@acmefitness.com',
    });

    assert.ok(rendered.subject.length > 0, `Subject for ${stepDef.templateId} must not be empty`);
    assert.ok(rendered.html.includes('Sarah Connor'), `HTML must contain Customer Name`);
    assert.ok(rendered.html.includes('$149.00') || rendered.html.includes('149.00'), `HTML must contain Invoice Amount`);
    assert.ok(rendered.html.includes('Acme Fitness'), `HTML must contain Business Name`);
    assert.ok(rendered.html.includes('rec_token_123'), `HTML must contain secure Recovery Link`);
    assert.ok(!rendered.html.includes('reviveos.io') && !rendered.html.includes('reviveos@'), `HTML must never leak reviveos branding`);
    console.log(`  ✓ Step ${stepDef.step} (Day ${stepDef.dayOffset}): "${rendered.subject}" validated.`);
  }

  // =========================================================================
  // 6, 7, 8, 9, 10. RECOVERY ENGINE EXECUTION, TRACKING, ATTRIBUTION, TIMELINE & SAFETY GUARDS
  // =========================================================================
  console.log('\n--- 5. Testing Recovery Email Engine, Tracking, Attribution & Safety Guards ---');

  // Create Customer & Opportunity in Workspace A
  const custA = db.createCustomer(wsA, {
    name: 'Marcus Brody',
    email: 'marcus@brodyarch.org',
  });

  const oppA = db.createRecoveryOpportunity(wsA, {
    customer_id: custA.id,
    amount_at_risk_cents: 9900,
    currency: 'USD',
    payment_failure: {
      raw_error_message: 'Your card has insufficient funds.',
      normalized_category: 'insufficient_funds',
    } as any,
  });

  // Enable test interceptor for deterministic simulation
  EmailDeliveryEngine.setMockInterceptor(async (provider, payload) => {
    return {
      success: true,
      messageId: `msg_test_${provider}_${Date.now()}`,
    };
  });

  // A. Execute Step 0 (Day 0: Payment Failed)
  const step0Result = await RecoveryEmailEngine.executeSequenceStep(wsA, oppA.id, 0);
  assert.ok(step0Result.executed, 'Step 0 must execute successfully');
  assert.strictEqual(step0Result.step, 0);
  assert.strictEqual(step0Result.dayOffset, 0);
  assert.ok(step0Result.deliveryLog, 'Delivery log must be created');

  const log0 = step0Result.deliveryLog!;
  assert.strictEqual(log0.is_recovery_email, true);
  assert.strictEqual(log0.sequence_step, 0);

  // Verify Customer Timeline: Event 1 (Recovery Email Sent)
  const timelineA1 = db.getCustomerTimeline(custA.id, wsA);
  const emailSentEvent = timelineA1.find((e) => e.event_type === 'recovery_email_sent');
  assert.ok(emailSentEvent, 'Timeline must record "Recovery Email Sent"');
  assert.strictEqual(emailSentEvent.title, 'Recovery Email Sent');
  console.log('  ✓ Step 0 sent & recorded on Customer Timeline as "Recovery Email Sent".');

  // B. Safety Rule 1: Never Send Duplicate Emails (Idempotency Guard)
  const duplicateResult = await RecoveryEmailEngine.executeSequenceStep(wsA, oppA.id, 0);
  assert.strictEqual(duplicateResult.executed, false);
  assert.strictEqual(duplicateResult.skipped, true);
  assert.ok(duplicateResult.reason.includes('already been sent'), 'Must skip duplicate send due to idempotency guard');
  console.log('  ✓ Safety Rule (Zero Duplicates) verified.');

  // C. Delivery Tracking: Customer Opens Email (Tracking Pixel)
  const openedLog = await RecoveryEmailEngine.recordEmailOpened(log0.id);
  assert.ok(openedLog, 'Email log must be found');
  assert.ok(openedLog.opened_at, 'opened_at must be populated');
  assert.strictEqual(openedLog.status, 'opened');

  const timelineA2 = db.getCustomerTimeline(custA.id, wsA);
  const emailOpenedEvent = timelineA2.find((e) => e.event_type === 'recovery_email_opened');
  assert.ok(emailOpenedEvent, 'Timeline must record "Email Opened"');
  assert.strictEqual(emailOpenedEvent.title, 'Email Opened');
  console.log('  ✓ Open tracked & recorded on Customer Timeline as "Email Opened".');

  // D. Delivery Tracking: Customer Clicks Recovery Link
  const clickedLog = await RecoveryEmailEngine.recordRecoveryLinkClicked(log0.id);
  assert.ok(clickedLog, 'Email log must be found');
  assert.ok(clickedLog.clicked_at, 'clicked_at must be populated');
  assert.strictEqual(clickedLog.status, 'clicked');

  const timelineA3 = db.getCustomerTimeline(custA.id, wsA);
  const linkClickedEvent = timelineA3.find((e) => e.event_type === 'recovery_link_clicked');
  assert.ok(linkClickedEvent, 'Timeline must record "Recovery Link Clicked"');
  assert.strictEqual(linkClickedEvent.title, 'Recovery Link Clicked');
  console.log('  ✓ Click tracked & recorded on Customer Timeline as "Recovery Link Clicked".');

  // E. Recovery Attribution: Payment Settled -> Revenue Attributed to Step 0 Email
  const recoveryPayment = db.settleRecoveryPayment(
    oppA.id,
    {
      amountCents: 9900,
      providerPaymentId: 'pi_test_settled_123',
      method: 'credit_card',
    },
    wsA
  );
  assert.ok(recoveryPayment.success, 'Payment recovery must succeed');

  // Check Email Delivery Log attribution
  const updatedLog0 = db.getEmailDeliveryLog(log0.id);
  assert.ok(updatedLog0, 'Log must exist');
  assert.strictEqual(updatedLog0.status, 'recovered');
  assert.strictEqual(updatedLog0.recovered_amount_cents, 9900);
  assert.ok(updatedLog0.recovered_at, 'recovered_at must be populated');

  // Check Customer Timeline: Event 4 (Payment Recovered)
  const timelineA4 = db.getCustomerTimeline(custA.id, wsA);
  const paymentRecoveredEvent = timelineA4.find((e) => e.event_type === 'payment_recovered');
  assert.ok(paymentRecoveredEvent, 'Timeline must record "Payment Recovered"');
  assert.strictEqual(paymentRecoveredEvent.title, 'Payment Recovered');
  assert.strictEqual(paymentRecoveredEvent.metadata?.delivery_log_id, log0.id, 'Timeline must link payment to the attributed email');
  console.log('  ✓ Revenue ($99.00) attributed to Day 0 email & recorded on Customer Timeline as "Payment Recovered".');

  // F. Safety Rule 2: Never Send After Successful Recovery
  const postRecoveryStep = await RecoveryEmailEngine.executeSequenceStep(wsA, oppA.id, 1);
  assert.strictEqual(postRecoveryStep.executed, false);
  assert.strictEqual(postRecoveryStep.skipped, true);
  assert.ok(postRecoveryStep.reason.includes('already been successfully recovered'), 'Must halt outreach once recovered');
  console.log('  ✓ Safety Rule (Halt After Recovery) verified.');

  // G. Safety Rule 3: Respect Suppression Lists
  const custBlocked = db.createCustomer(wsA, {
    name: 'Blocked User',
    email: 'unsubscribed@domain.com',
  });
  const oppBlocked = db.createRecoveryOpportunity(wsA, {
    customer_id: custBlocked.id,
    amount_at_risk_cents: 5000,
    currency: 'USD',
  });

  // Add to suppression list
  db.addEmailSuppression(wsA, 'unsubscribed@domain.com', 'unsubscribe', 'manual_test');
  assert.ok(db.isEmailSuppressed(wsA, 'unsubscribed@domain.com'), 'Email must be in suppression list');

  const suppressedStep = await RecoveryEmailEngine.executeSequenceStep(wsA, oppBlocked.id, 0);
  assert.strictEqual(suppressedStep.executed, false);
  assert.strictEqual(suppressedStep.skipped, true);
  assert.ok(suppressedStep.reason.includes('suppression list'), 'Must block send for suppressed email address');

  const blockedLogs = db.getRecoveryEmailLogs(wsA, oppBlocked.id);
  assert.ok(blockedLogs.some((l) => l.status === 'suppressed'), 'Must log suppressed status');
  console.log('  ✓ Safety Rule (Respect Suppression Lists) verified.');

  // =========================================================================
  // 11. ANALYTICS & METRIC CALCULATIONS
  // =========================================================================
  console.log('\n--- 6. Testing Analytics & Metric Aggregations ---');

  const analyticsA = db.getEmailAnalytics(wsA);
  assert.ok(analyticsA.emails_sent >= 1, 'Emails sent must be >= 1');
  assert.ok(analyticsA.total_opened >= 1, 'Total opened must be >= 1');
  assert.ok(analyticsA.total_clicked >= 1, 'Total clicked must be >= 1');
  assert.ok(analyticsA.total_recovered >= 1, 'Total recovered must be >= 1');
  assert.strictEqual(analyticsA.revenue_recovered_cents, 9900, 'Revenue recovered must equal 9900 cents ($99.00)');
  assert.ok(analyticsA.open_rate > 0, 'Open rate must be positive percentage');
  assert.ok(analyticsA.click_rate > 0, 'Click rate must be positive percentage');
  console.log(`  ✓ Authoritative Analytics verified: Sent=${analyticsA.emails_sent}, Opens=${analyticsA.open_rate}%, Clicks=${analyticsA.click_rate}%, Recovered=$${(analyticsA.revenue_recovered_cents / 100).toFixed(2)}`);

  // =========================================================================
  // 12. MULTI-TENANT ISOLATION
  // =========================================================================
  console.log('\n--- 7. Testing Multi-Tenant Isolation (Workspace A vs Workspace B) ---');

  // Verify Workspace B has zero access to Workspace A's logs or suppressions
  const logsB = db.getRecoveryEmailLogs(wsB);
  assert.strictEqual(logsB.length, 0, 'Workspace B must not see Workspace A email logs');

  const suppressionsB = db.getEmailSuppressions(wsB);
  assert.strictEqual(suppressionsB.length, 0, 'Workspace B must not see Workspace A suppressions');

  const analyticsB = db.getEmailAnalytics(wsB);
  assert.strictEqual(analyticsB.emails_sent, 0, 'Workspace B analytics must be isolated');
  assert.strictEqual(analyticsB.revenue_recovered_cents, 0);

  // Clean up test interceptor
  EmailDeliveryEngine.setMockInterceptor(undefined);
  console.log('  ✓ Strict multi-tenant isolation verified.');

  console.log('\n🎉 ALL PRODUCTION EMAIL RECOVERY INFRASTRUCTURE TESTS PASSED (100%)!\n');
}

runProductionEmailRecoveryTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
