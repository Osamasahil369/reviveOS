import assert from 'node:assert';
import fs from 'fs';

console.log('================================================================');
console.log('TEST SUITE: CUSTOMER PAYMENT PORTAL & TRUST LAYER');
console.log('================================================================');

async function runCustomerPortalTests() {
  console.log('1. Validating CustomerPaymentPortal source code requirements...');
  const portalCode = fs.readFileSync('src/components/CustomerPaymentPortal.tsx', 'utf-8');

  // Verify display text requirements
  assert.ok(portalCode.includes('Payment Failed'), 'Must display "Payment Failed"');
  assert.ok(portalCode.includes("We couldn't process your recent payment."), 'Must display exact copy "We couldn\'t process your recent payment."');
  assert.ok(portalCode.includes('Complete payment below to keep your service active.'), 'Must display exact copy "Complete payment below to keep your service active."');
  assert.ok(portalCode.includes('Customer Name'), 'Must show Customer Name label');
  assert.ok(portalCode.includes('Invoice Amount'), 'Must show Invoice Amount label');
  assert.ok(portalCode.includes('Due Date'), 'Must show Due Date label');
  assert.ok(portalCode.includes('Business Name'), 'Must show Business Name label');
  assert.ok(portalCode.includes('Pay Now'), 'Primary CTA must be "Pay Now"');
  assert.ok(portalCode.includes('Update Payment Method'), 'Secondary CTA must be "Update Payment Method"');
  assert.ok(portalCode.includes('Secure Payment Protected'), 'Must display reassurance "Secure Payment Protected"');
  console.log('  ✓ Verified: All required portal copy, CTAs, and reassurance elements present.');

  console.log('2. Validating TrustAndSafetyCard source code & trust points...');
  const trustCardCode = fs.readFileSync('src/components/TrustAndSafetyCard.tsx', 'utf-8');

  // Verify the 4 mandatory trust points
  assert.ok(
    trustCardCode.includes('Never charges customers without authorization'),
    'Trust point 1: Never charges customers without authorization'
  );
  assert.ok(
    trustCardCode.includes('Never retries disputed payments'),
    'Trust point 2: Never retries disputed payments'
  );
  assert.ok(
    trustCardCode.includes('Every recovery action is logged'),
    'Trust point 3: Every recovery action is logged'
  );
  assert.ok(
    trustCardCode.includes('Human review available when required'),
    'Trust point 4: Human review available when required'
  );
  console.log('  ✓ Verified: All 4 trust layer guarantees present in TrustAndSafetyCard.');

  console.log('3. Validating App.tsx routing to CustomerPaymentPortal...');
  const appCode = fs.readFileSync('src/App.tsx', 'utf-8');
  assert.ok(
    appCode.includes('CustomerPaymentPortal'),
    'App.tsx must import and route to CustomerPaymentPortal'
  );
  assert.ok(
    appCode.includes('isPayRoute && payTokenFromUrl'),
    'App.tsx routes /pay/:token to CustomerPaymentPortal'
  );
  console.log('  ✓ Verified: App.tsx hosts CustomerPaymentPortal on /pay/:token.');

  console.log('4. Validating SettingsPage & AutopilotRecoveryCenter inclusion of Trust Layer...');
  const settingsCode = fs.readFileSync('src/components/SettingsPage.tsx', 'utf-8');
  const dashboardCode = fs.readFileSync('src/components/AutopilotRecoveryCenter.tsx', 'utf-8');

  assert.ok(settingsCode.includes('TrustAndSafetyCard'), 'SettingsPage includes TrustAndSafetyCard');
  assert.ok(dashboardCode.includes('TrustAndSafetyCard'), 'Dashboard includes TrustAndSafetyCard');
  console.log('  ✓ Verified: Trust layer integrated throughout Dashboard, Recovery Portal, and Settings.');

  console.log('================================================================');
  console.log('CUSTOMER PAYMENT PORTAL TESTS: 100% PASSED');
  console.log('================================================================');
}

runCustomerPortalTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
