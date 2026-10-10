import { Router, Request, Response } from 'express';
import { RazorpayOAuthService } from '../services/razorpayOAuthService.js';
import { supabaseService } from '../db/supabaseService.js';
import { isSupabaseAuthoritative } from '../db/storageMode.js';
import { isSupabaseConfigured } from '../db/supabaseClient.js';
import { db } from '../store/db.js';
import { AutopilotService } from '../services/autopilotService.js';
import { requireRole } from '../middleware/tenantIsolation.js';

function shouldUseSupabase(): boolean {
  return isSupabaseAuthoritative() && isSupabaseConfigured();
}

export const razorpayOAuthRouter = Router();

function resolveWorkspaceId(req: Request): string | null {
  const queryWs = req.query.workspace_id || req.query.workspaceId;
  if (typeof queryWs === 'string' && queryWs.trim()) {
    return queryWs.trim();
  }

  const headerWs = req.headers['x-workspace-id'];
  if (typeof headerWs === 'string' && headerWs.trim()) {
    return headerWs.trim();
  }

  const user = (req as any).user;
  if (user?.workspace_id) {
    return user.workspace_id;
  }

  return null;
}

/**
 * GET /api/auth/razorpay/authorize
 * Initiates Razorpay OAuth authorization flow.
 * Returns authorization URL (JSON) or redirects the browser.
 */
razorpayOAuthRouter.get('/api/auth/razorpay/authorize', async (req: Request, res: Response) => {
  try {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({
        error: 'Missing required parameter: workspace_id must be provided in query or x-workspace-id header.',
      });
    }

    const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
    const simulate = req.query.simulate === 'true' || req.query.simulated === 'true';
    const fallbackHost = req.get('host');

    const authResult = RazorpayOAuthService.getAuthorizeUrl(workspaceId, {
      redirectUri,
      simulate,
      fallbackHost,
    });

    const wantsJson =
      req.query.format === 'json' ||
      (req.headers.accept && req.headers.accept.includes('application/json'));

    if (wantsJson) {
      return res.json({
        url: authResult.url,
        state: authResult.state,
        isSimulated: authResult.isSimulated,
        redirectUri: RazorpayOAuthService.getRedirectUri(fallbackHost),
      });
    }

    return res.redirect(authResult.url);
  } catch (err: any) {
    console.error('[Razorpay OAuth] Error in /authorize:', err);
    return res.status(500).json({ error: err.message || 'Failed to initiate Razorpay OAuth flow' });
  }
});

/**
 * GET /api/auth/razorpay/callback
 * Handles OAuth callback from Razorpay.
 * Validates HMAC state, exchanges code for tokens, auto-provisions webhooks,
 * saves encrypted credentials, triggers initial scan, and sends postMessage to popup opener.
 */
razorpayOAuthRouter.get(['/api/auth/razorpay/callback', '/api/auth/razorpay/callback/'], async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  // 1. Handle error response from Razorpay
  if (error) {
    const errorMsg = (error_description as string) || (error as string) || 'Authorization declined by user';
    console.warn('[Razorpay OAuth] Provider returned error:', errorMsg);

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Razorpay Authorization Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #070d18; color: #f87171; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #0c182b; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; }
            h2 { color: #fca5a5; margin-top: 0; font-size: 18px; }
            p { color: #94a3b8; font-size: 13px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Connection Not Completed</h2>
            <p>${escapeHtml(errorMsg)}</p>
            <p style="font-size: 11px; color: #64748b;">This window will close automatically.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'RAZORPAY_OAUTH_ERROR',
                error: ${JSON.stringify(errorMsg)}
              }, '*');
              setTimeout(() => window.close(), 2500);
            } else {
              setTimeout(() => { window.location.href = '/?tab=providers&error=' + encodeURIComponent(${JSON.stringify(errorMsg)}); }, 2000);
            }
          </script>
        </body>
      </html>
    `);
  }

  // 2. Validate Code & State
  if (!state || typeof state !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html><html><body style="background:#070d18;color:#fff;font-family:sans-serif;padding:30px;">
        <h3>OAuth Error: Missing state parameter</h3>
      </body></html>
    `);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html><html><body style="background:#070d18;color:#fff;font-family:sans-serif;padding:30px;">
        <h3>OAuth Error: Missing authorization code</h3>
      </body></html>
    `);
  }

  try {
    // 3. Cryptographic State Verification (Tenant Isolation Guaranteed)
    const statePayload = RazorpayOAuthService.verifyState(state);
    const workspaceId = statePayload.workspaceId;
    const isSimulated = Boolean(statePayload.simulate || req.query.simulated === 'true');

    const redirectUri = RazorpayOAuthService.getRedirectUri(req.get('host'));

    // 4. Exchange authorization code for OAuth tokens
    const tokens = await RazorpayOAuthService.exchangeCodeForTokens(code, redirectUri, isSimulated);

    // 5. Automatically provision webhooks on the merchant account (Requirement 7)
    const webhookResult = await RazorpayOAuthService.provisionWebhook(
      tokens.access_token,
      tokens.razorpay_account_id,
      req.get('host')
    );

    // 6. Securely save connection with tenant-isolated AES-256-GCM encryption (Requirement 6)
    const oauthData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      accountId: tokens.razorpay_account_id,
      webhookSecret: webhookResult.webhookSecret,
      webhookId: webhookResult.webhookId,
      isLive: !tokens.access_token.includes('test') && !tokens.access_token.includes('sim_'),
      subscribedEvents: webhookResult.events,
      scope: tokens.scope,
    };

    let connection: any;
    if (shouldUseSupabase()) {
      connection = await supabaseService.saveOAuthProviderConnection(workspaceId, 'razorpay', oauthData);
    } else {
      connection = await db.saveOAuthProviderConnection(workspaceId, 'razorpay', oauthData);
    }

    // 7. Automatically trigger initial revenue scan (Requirement 11)
    let autoScanInfo: any = null;
    try {
      autoScanInfo = await AutopilotService.handleProviderConnected(workspaceId, 'razorpay', connection);
    } catch (scanErr: any) {
      console.warn('[Razorpay OAuth] Initial revenue scan notice:', scanErr.message);
    }

    const payloadToParent = {
      type: 'RAZORPAY_OAUTH_SUCCESS',
      workspaceId,
      accountId: tokens.razorpay_account_id,
      autoWebhooksProvisioned: true,
      scanTriggered: autoScanInfo?.scanTriggered ?? true,
      scanResult: autoScanInfo?.scanResult ?? null,
    };

    // 8. Onboarding Success Response
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Razorpay Connected Successfully</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #050b14; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #0a1526; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 20px; padding: 36px; max-width: 440px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            .icon-badge { width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #10b981; font-size: 26px; }
            h2 { color: #ffffff; margin: 0 0 8px; font-size: 20px; font-weight: 700; }
            p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 16px; }
            .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #34d399; font-size: 12px; font-weight: 600; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-badge">✓</div>
            <h2>Razorpay Connected!</h2>
            <p>Account ID: <span class="status-pill">${escapeHtml(tokens.razorpay_account_id)}</span></p>
            <p>Revenue leak scanner and automated recovery webhooks are now active.</p>
            <div style="font-size: 11px; color: #64748b;">Closing window and returning to dashboard...</div>
          </div>
          <script>
            const payload = ${JSON.stringify(payloadToParent)};
            if (window.opener) {
              window.opener.postMessage(payload, '*');
              setTimeout(() => {
                try { window.close(); } catch(e) {}
              }, 800);
            } else {
              setTimeout(() => {
                window.location.href = '/?tab=providers&connected=razorpay&account=' + encodeURIComponent(payload.accountId);
              }, 1200);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[Razorpay OAuth] Callback processing error:', err);
    return res.status(400).send(`
      <!DOCTYPE html><html><body style="background:#070d18;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;">
        <h3>Authorization Verification Failed</h3>
        <p style="color:#94a3b8;">${escapeHtml(err.message)}</p>
      </body></html>
    `);
  }
});

/**
 * POST /api/auth/razorpay/refresh
 * Refreshes OAuth token for a given workspace.
 * Requires admin or owner authorization.
 */
razorpayOAuthRouter.post('/api/auth/razorpay/refresh', requireRole(['owner', 'admin']), async (req: Request, res: Response) => {
  try {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspace_id is required.' });
    }

    let credentials: any = null;
    if (shouldUseSupabase()) {
      credentials = await supabaseService.getDecryptedProviderCredentials(workspaceId, 'razorpay');
    } else {
      const conn = db.getProviderConnection(workspaceId, 'razorpay');
      if (conn) {
        credentials = {
          accessToken: conn.api_key,
          refreshToken: conn.api_secret,
          authType: (conn as any).metadata?.auth_type || 'api_key',
          accountId: (conn as any).metadata?.account_id,
        };
      }
    }

    if (!credentials || credentials.authType !== 'oauth' || !credentials.refreshToken) {
      return res.status(400).json({
        error: 'Razorpay is not connected via OAuth or no refresh token is stored for this workspace.',
      });
    }

    const isSimulated = Boolean(credentials.accessToken?.includes('sim_') || credentials.refreshToken?.includes('sim_'));
    const refreshed = await RazorpayOAuthService.refreshAccessToken(credentials.refreshToken, isSimulated);

    // Save renewed tokens
    if (shouldUseSupabase()) {
      await supabaseService.saveOAuthProviderConnection(workspaceId, 'razorpay', {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: refreshed.expires_at,
        accountId: refreshed.razorpay_account_id || credentials.accountId,
        webhookSecret: credentials.webhookSecret,
        scope: refreshed.scope,
      });
    } else {
      await db.saveOAuthProviderConnection(workspaceId, 'razorpay', {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: refreshed.expires_at,
        accountId: refreshed.razorpay_account_id || credentials.accountId,
        webhookSecret: credentials.webhookSecret,
        scope: refreshed.scope,
      });
    }

    return res.json({
      success: true,
      expires_at: refreshed.expires_at,
      account_id: refreshed.razorpay_account_id || credentials.accountId,
      message: 'Razorpay OAuth access token refreshed successfully.',
    });
  } catch (err: any) {
    console.error('[Razorpay OAuth] Error refreshing token:', err);
    return res.status(500).json({ error: err.message || 'Failed to refresh token' });
  }
});

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
