import { strict as assert } from 'assert';
import net from 'net';
import { db } from '../server/store/db.js';
import { EmailDeliveryEngine } from '../server/services/emailDeliveryEngine.js';
import { SmtpEmailProvider } from '../server/services/emailProviderService.js';
import { EmailProviderConfig } from '../src/types/index.js';

/**
 * Creates a lightweight, real RFC 5321/4954 authenticated SMTP server
 * on localhost to verify real socket handshake and authentication success/failure.
 */
function createTestSmtpServer(port: number, validUser: string, validPass: string) {
  const server = net.createServer((socket) => {
    let authState: 'none' | 'login_user' | 'login_pass' = 'none';
    let inputUser = '';

    socket.write('220 reviveos.local ESMTP TestMailService\r\n');

    socket.on('data', (data) => {
      const line = data.toString().trim();
      const upper = line.toUpperCase();

      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        socket.write('250-reviveos.local Hello\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
      } else if (upper === 'AUTH LOGIN') {
        authState = 'login_user';
        socket.write('334 VXNlcm5hbWU6\r\n'); // Base64 for "Username:"
      } else if (authState === 'login_user') {
        inputUser = Buffer.from(line, 'base64').toString('utf8');
        authState = 'login_pass';
        socket.write('334 UGFzc3dvcmQ6\r\n'); // Base64 for "Password:"
      } else if (authState === 'login_pass') {
        const inputPass = Buffer.from(line, 'base64').toString('utf8');
        if (inputUser === validUser && inputPass === validPass) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else {
          socket.write('535 5.7.8 Authentication credentials rejected by server\r\n');
        }
        authState = 'none';
      } else if (upper.startsWith('AUTH PLAIN')) {
        const parts = line.split(' ');
        if (parts.length > 2) {
          const decoded = Buffer.from(parts[2], 'base64').toString('utf8');
          // Format: \0user\0pass
          const tokens = decoded.split('\0').filter(Boolean);
          if (tokens.length >= 2 && tokens[0] === validUser && tokens[1] === validPass) {
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else {
            socket.write('535 5.7.8 Authentication credentials rejected by server\r\n');
          }
        } else {
          socket.write('535 5.7.8 Malformed plain credentials\r\n');
        }
      } else if (upper.startsWith('QUIT')) {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
      } else {
        socket.write('250 OK\r\n');
      }
    });
  });

  return new Promise<{ server: net.Server; close: () => Promise<void> }>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

async function runSmtpVerificationTestSuite() {
  console.log('🚀 [TEST SUITE] REAL SMTP CONNECTION & AUTHENTICATION VERIFICATION\n');

  db.setPersistenceEnabled(false);
  const smtpProvider = new SmtpEmailProvider();

  // =========================================================================
  // REQUIREMENT: DO NOT MARK SMTP AS CONNECTED BASED SOLELY ON CONFIG PRESENCE
  // =========================================================================
  console.log('--- 1. Testing Configuration Presence Alone Guard ---');
  const configOnlyHost: EmailProviderConfig = {
    primary_provider: 'smtp',
    provider_priority: ['smtp'],
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
    },
  };

  const resultNoAuth = await smtpProvider.verify(configOnlyHost);
  assert.strictEqual(resultNoAuth.verified, false, 'Must NOT be verified based solely on host presence');
  assert.strictEqual(resultNoAuth.status, 'failed', 'Status must be "failed" when credentials are absent');
  assert.ok(
    resultNoAuth.error?.includes('requires both username and password') ||
    resultNoAuth.error?.includes('Unauthenticated'),
    'Error must explain that unauthenticated connection cannot be marked connected'
  );
  console.log('  ✓ PASS: Configuration presence alone never marks SMTP as connected.');

  // =========================================================================
  // REQUIREMENT 5A: REAL CONNECTION & AUTH TEST AGAINST GOOGLE WORKSPACE SMTP
  // =========================================================================
  console.log('\n--- 2. Real SMTP Connection Test: Google Workspace (smtp.gmail.com:587) ---');
  const googleConfig: EmailProviderConfig = {
    primary_provider: 'smtp',
    provider_priority: ['smtp'],
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      username: 'billing@enterprise-acme.com',
      password: 'invalid_app_pass_test',
    },
  };

  const googleResult = await smtpProvider.verify(googleConfig);
  assert.strictEqual(googleResult.verified, false, 'Google Workspace must not be verified with invalid credentials');
  assert.strictEqual(googleResult.status, 'failed', 'Google Workspace status must be "failed"');
  assert.ok(
    googleResult.error?.includes('535') || googleResult.error?.includes('Username and Password not accepted'),
    `Google Workspace error must be exact SMTP 535 error. Received: "${googleResult.error}"`
  );
  assert.strictEqual(googleResult.details?.responseCode, 535, 'Google Workspace response code must be 535');
  console.log(`  ✓ PASS: Google Workspace real SMTP connection tested. Exact server response: "${googleResult.error}"`);

  // =========================================================================
  // REQUIREMENT 5B: REAL CONNECTION & AUTH TEST AGAINST ZOHO SMTP
  // =========================================================================
  console.log('\n--- 3. Real SMTP Connection Test: Zoho SMTP (smtp.zoho.com:587) ---');
  const zohoConfig: EmailProviderConfig = {
    primary_provider: 'smtp',
    provider_priority: ['smtp'],
    smtp: {
      host: 'smtp.zoho.com',
      port: 587,
      secure: false,
      username: 'billing@enterprise-acme.com',
      password: 'invalid_zoho_pass_test',
    },
  };

  const zohoResult = await smtpProvider.verify(zohoConfig);
  assert.strictEqual(zohoResult.verified, false, 'Zoho SMTP must not be verified with invalid credentials');
  assert.strictEqual(zohoResult.status, 'failed', 'Zoho SMTP status must be "failed"');
  assert.ok(
    zohoResult.error?.includes('535') || zohoResult.error?.includes('Authentication Failed'),
    `Zoho error must be exact SMTP 535 error. Received: "${zohoResult.error}"`
  );
  assert.strictEqual(zohoResult.details?.responseCode, 535, 'Zoho response code must be 535');
  console.log(`  ✓ PASS: Zoho real SMTP connection tested. Exact server response: "${zohoResult.error}"`);

  // =========================================================================
  // REQUIREMENT 5C: REAL CONNECTION & AUTH TEST AGAINST MICROSOFT 365 SMTP
  // =========================================================================
  console.log('\n--- 4. Real SMTP Connection Test: Microsoft 365 (smtp.office365.com:587) ---');
  const m365Config: EmailProviderConfig = {
    primary_provider: 'smtp',
    provider_priority: ['smtp'],
    smtp: {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      username: 'billing@enterprise-acme.com',
      password: 'invalid_m365_pass_test',
    },
  };

  const m365Result = await smtpProvider.verify(m365Config);
  assert.strictEqual(m365Result.verified, false, 'Microsoft 365 must not be verified with invalid credentials');
  assert.strictEqual(m365Result.status, 'failed', 'Microsoft 365 status must be "failed"');
  assert.ok(
    m365Result.error?.includes('535') || m365Result.error?.includes('Authentication unsuccessful'),
    `Microsoft 365 error must be exact SMTP 535 error. Received: "${m365Result.error}"`
  );
  assert.strictEqual(m365Result.details?.responseCode, 535, 'Microsoft 365 response code must be 535');
  console.log(`  ✓ PASS: Microsoft 365 real SMTP connection tested. Exact server response: "${m365Result.error}"`);

  // =========================================================================
  // REQUIREMENT 5D: REAL CONNECTION & AUTH TEST AGAINST HOSTINGER SMTP
  // =========================================================================
  console.log('\n--- 5. Real SMTP Connection Test: Hostinger SMTP (smtp.hostinger.com:587) ---');
  const hostingerConfig: EmailProviderConfig = {
    primary_provider: 'smtp',
    provider_priority: ['smtp'],
    smtp: {
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false,
      username: 'billing@enterprise-acme.com',
      password: 'invalid_hostinger_pass_test',
    },
  };

  const hostingerResult = await smtpProvider.verify(hostingerConfig);
  assert.strictEqual(hostingerResult.verified, false, 'Hostinger SMTP must not be verified with invalid credentials');
  assert.strictEqual(hostingerResult.status, 'failed', 'Hostinger SMTP status must be "failed"');
  assert.ok(
    hostingerResult.error?.includes('535') || hostingerResult.error?.includes('authentication failed'),
    `Hostinger error must be exact SMTP 535 error. Received: "${hostingerResult.error}"`
  );
  assert.strictEqual(hostingerResult.details?.responseCode, 535, 'Hostinger response code must be 535');
  console.log(`  ✓ PASS: Hostinger real SMTP connection tested. Exact server response: "${hostingerResult.error}"`);

  // =========================================================================
  // REAL SOCKET AUTHENTICATION SUCCESS & FAILURE LIFECYCLE
  // =========================================================================
  console.log('\n--- 6. Testing Successful vs Failed Authentication on Live Socket ---');
  const testPort = 25255;
  const validUser = 'verified_merchant@domain.com';
  const validPass = 'SecureAppSecret#2026!';

  const localSmtp = await createTestSmtpServer(testPort, validUser, validPass);

  try {
    // 6A. Test with VALID credentials -> MUST RETURN CONNECTED
    const validConfig: EmailProviderConfig = {
      primary_provider: 'smtp',
      provider_priority: ['smtp'],
      smtp: {
        host: '127.0.0.1',
        port: testPort,
        secure: false,
        username: validUser,
        password: validPass,
      },
    };

    const validResult = await smtpProvider.verify(validConfig);
    assert.strictEqual(validResult.verified, true, 'Real SMTP authentication must succeed with valid credentials');
    assert.strictEqual(validResult.status, 'connected', 'Status must be "connected" only when authentication succeeds');
    assert.strictEqual(validResult.details?.host, '127.0.0.1');
    assert.strictEqual(validResult.details?.port, testPort);
    assert.strictEqual(validResult.details?.user, validUser);
    console.log('  ✓ PASS: Live SMTP handshake succeeded -> Returned status: "connected".');

    // 6B. Test with INVALID credentials -> MUST RETURN FAILED with exact error
    const invalidConfig: EmailProviderConfig = {
      primary_provider: 'smtp',
      provider_priority: ['smtp'],
      smtp: {
        host: '127.0.0.1',
        port: testPort,
        secure: false,
        username: validUser,
        password: 'wrong_password_attempt',
      },
    };

    const invalidResult = await smtpProvider.verify(invalidConfig);
    assert.strictEqual(invalidResult.verified, false, 'Real SMTP authentication must fail with wrong credentials');
    assert.strictEqual(invalidResult.status, 'failed', 'Status must be "failed" when credentials are rejected');
    assert.ok(
      invalidResult.error?.includes('535') && invalidResult.error?.includes('Authentication credentials rejected by server'),
      `Error must contain exact server message. Got: "${invalidResult.error}"`
    );
    console.log(`  ✓ PASS: Live SMTP handshake rejected credentials -> Returned status: "failed" with exact error: "${invalidResult.error}".`);
  } finally {
    await localSmtp.close();
  }

  // =========================================================================
  // END-TO-END WORKSPACE VERIFICATION & DATABASE STATUS GUARD
  // =========================================================================
  console.log('\n--- 7. Testing End-to-End Workspace Verification & DB Persistence ---');
  const ws = db.createWorkspace('Acme SMTP Workspace ' + Date.now(), 'saas_recurring', 'USD', false);

  // Set workspace config with Google Workspace credentials
  db.saveEmailProviderConfig(ws.id, {
    primary_provider: 'smtp',
    business_name: 'Acme Workspace',
    sender_address: 'billing@acmeworkspace.com',
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      username: 'billing@acmeworkspace.com',
      password: 'invalid_password_to_check',
    },
  });

  // Verify workspace
  const wsVerificationResult = await EmailDeliveryEngine.verifySenderOwnership(ws.id);
  assert.strictEqual(wsVerificationResult.verified, false);
  assert.strictEqual(wsVerificationResult.status, 'failed');

  // Verify DB record updated accurately
  const savedWsConfig = db.getEmailProviderConfig(ws.id);
  assert.strictEqual(savedWsConfig.verification_status, 'failed');
  assert.ok(savedWsConfig.verification_error?.includes('535'), 'DB must store exact SMTP error code');
  console.log('  ✓ PASS: Workspace DB persisted status: "failed" with exact error in audit record.');

  console.log('\n🎉 ALL REAL SMTP VERIFICATION TESTS PASSED (100%)!\n');
}

runSmtpVerificationTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ SMTP VERIFICATION TEST FAILED:', err);
    process.exit(1);
  });
