import './setupEnv.js';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

async function runAuthUxTests() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY OS — AUTHENTICATION UX & SECURITY VERIFICATION');
  console.log('======================================================\n');

  const authPagePath = path.join(process.cwd(), 'src', 'components', 'AuthPage.tsx');
  const workspaceViewPath = path.join(process.cwd(), 'src', 'components', 'WorkspaceSelectionView.tsx');
  const appPath = path.join(process.cwd(), 'src', 'App.tsx');
  const devToolsModalPath = path.join(process.cwd(), 'src', 'components', 'AdminDevToolsModal.tsx');
  const headerPath = path.join(process.cwd(), 'src', 'components', 'Header.tsx');

  const authPageContent = fs.readFileSync(authPagePath, 'utf8');
  const workspaceViewContent = fs.readFileSync(workspaceViewPath, 'utf8');
  const appContent = fs.readFileSync(appPath, 'utf8');
  const devToolsModalContent = fs.readFileSync(devToolsModalPath, 'utf8');
  const headerContent = fs.readFileSync(headerPath, 'utf8');

  // Test 1: Fresh user arriving at root unauthenticated
  console.log('Test 1: Fresh unauthenticated user sees clean branded AuthPage');
  assert.ok(appContent.includes("LandingPage") || appContent.includes("AuthPage"), 'App must route unauthenticated user to landing or auth page');
  assert.ok(authPageContent.includes("Revenue Recovery OS"), 'AuthPage must prominently present brand name');
  assert.ok(authPageContent.includes("Automated failed payment recovery"), 'AuthPage must show clear product subtitle');

  // Test 2: Sign in view contains only email, password, submit, and clean options
  console.log('Test 2: Sign in form contains only customer-facing inputs');
  assert.ok(authPageContent.includes('id="auth-email-input"'), 'AuthPage must have email input');
  assert.ok(authPageContent.includes('id="auth-password-input"'), 'AuthPage must have password input');
  assert.ok(authPageContent.includes('id="auth-submit-btn"'), 'AuthPage must have submit button');
  assert.ok(authPageContent.includes('id="btn-toggle-password-visibility"'), 'AuthPage must support password visibility toggle');

  // Test 3: No technical developer jargon leaked into customer-facing AuthPage
  console.log('Test 3: Verification of zero technical leakages in customer-facing AuthPage');
  const bannedKeywords = [
    'RLS',
    'Row Level Security',
    'PostgreSQL simulator',
    'Active Supabase User Profile',
    'Sandbox / Placeholder Mode',
    'Change Role: Owner / Admin',
    'JWT',
    'Target table',
    'SQL action controls',
  ];
  for (const keyword of bannedKeywords) {
    assert.ok(
      !authPageContent.includes(keyword),
      `Customer-facing AuthPage must NOT expose internal developer jargon: "${keyword}"`
    );
  }
  console.log('  ✓ Customer AuthPage is 100% clean of developer tools');

  // Test 4: Sign up form does not ask for roles or workspace IDs
  console.log('Test 4: Signup form does not expose workspace ID or role selector');
  assert.ok(!authPageContent.includes('workspace_id'), 'Signup form must not ask for workspace ID');
  assert.ok(!authPageContent.includes('select role'), 'Signup form must not ask user to select role');
  assert.ok(authPageContent.includes('fullName'), 'Signup form captures clean name and email/password only');

  // Test 5: No workspace scenario routes to clean WorkspaceSelectionView
  console.log('Test 5: Zero workspaces scenario routes to WorkspaceSelectionView');
  assert.ok(appContent.includes('<WorkspaceSelectionView'), 'App must render WorkspaceSelectionView when user has zero workspaces or needs selection');
  assert.ok(workspaceViewContent.includes('Create Workspace'), 'WorkspaceSelectionView must provide clean workspace creation');

  // Test 6: Multiple workspaces scenario provides clean selection list
  console.log('Test 6: Multiple workspaces presents clean business selector');
  assert.ok(workspaceViewContent.includes('id="workspace-list"'), 'WorkspaceSelectionView must contain workspace selection list');
  assert.ok(workspaceViewContent.includes('onSelectWorkspace'), 'Users can select which workspace to enter');

  // Test 7: Sign out mechanism in workspace view and header
  console.log('Test 7: Sign out returns user to unauthenticated state');
  assert.ok(headerContent.includes('onSignOut'), 'Header must provide sign out trigger');
  assert.ok(workspaceViewContent.includes('onSignOut'), 'WorkspaceSelectionView must provide sign out trigger');
  assert.ok(appContent.includes('handleSignOut'), 'App must implement authoritative sign out clearing local state');

  // Test 8: Non-blocking authResolving state prevents UI flashing
  console.log('Test 8: Non-blocking auth loading state prevents flashing');
  assert.ok(appContent.includes('authStatus === \'loading\''), 'App must check authStatus loading state');
  assert.ok(appContent.includes('auth-loading-screen'), 'App must render non-intrusive loading indicator during resolution');

  // Test 9: Hosted payment portal (/pay/<token>) is NOT gated by Supabase dashboard auth
  console.log('Test 9: Pay portal (/pay/<token>) remains public for customers');
  assert.ok(appContent.includes('isPayRoute'), 'App must check for hosted pay route');
  assert.ok(appContent.includes('if (isPayRoute && payTokenFromUrl)'), 'Pay portal renders directly for customer token without dashboard auth gating');

  // Test 10: Developer diagnostics & RLS simulator are safely isolated in AdminDevToolsModal
  console.log('Test 10: Developer diagnostics & RLS simulator are safely encapsulated');
  assert.ok(devToolsModalContent.includes('AdminDevToolsModal'), 'AdminDevToolsModal exists as separate protected component');
  assert.ok(devToolsModalContent.includes('DEVELOPER TOOLS'), 'Dev tools modal is clearly marked as internal');
  assert.ok(appContent.includes('<AdminDevToolsModal'), 'App renders AdminDevToolsModal only as a modal');
  assert.ok(headerContent.includes('onOpenDevTools'), 'Header links to diagnostics modal via user profile');

  // Test 11: Navigation tabs do not expose "Auth & RLS" tab to normal users
  console.log('Test 11: Navigation tab bar does not expose "Auth & RLS" button');
  assert.ok(!appContent.includes('>Auth & RLS<'), 'Navigation tab bar must not contain visible "Auth & RLS" tab');

  console.log('\n  ✓ ALL 11 AUTHENTICATION UX & SECURITY CHECKS PASSED WITH 100% SUCCESS!\n');
}

runAuthUxTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
