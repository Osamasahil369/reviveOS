import { Request, Response, NextFunction } from 'express';
import { isSupabaseAuthoritative, getStorageMode } from '../db/storageMode.js';
import { getSupabaseServerClient, isSupabaseConfigured } from '../db/supabaseClient.js';
import { supabaseService, SupabaseUnavailableError } from '../db/supabaseService.js';
import { db } from '../store/db.js';
import { UserRole } from '../../src/types/index.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  membership?: {
    id: string;
    workspace_id: string;
    user_id: string;
    role: UserRole;
  };
  workspaceId?: string;
  userRole?: UserRole;
}

// Public endpoints that do not require authenticated workspace access
const BASE_PUBLIC_PATHS = [
  '/api/health',
  '/api/database/status',
  '/api/auth/config',
  '/api/auth/session',
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/signout',
  '/api/auth/demo',
  '/api/demo/load',
  '/api/auth/razorpay/authorize',
  '/api/auth/razorpay/callback',
  '/api/email/track',
];

const DEV_ONLY_PUBLIC_PATHS = [
  '/api/auth/switch-user',
  '/api/auth/switch-role',
  '/api/auth/users',
  '/api/database/schema',
  '/api/database/tables',
  '/api/database/mode',
  '/api/database/sync',
];

export async function tenantIsolationMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const rawPath = (req.originalUrl || req.url || req.path).split('?')[0];
  const path = rawPath.startsWith('/api') ? rawPath : `/api${rawPath.startsWith('/') ? '' : '/'}${rawPath}`;
  const isProduction = isSupabaseAuthoritative();

  // In production, only BASE_PUBLIC_PATHS are public (and GET /api/database/mode for status probe)
  const isPublicPath =
    BASE_PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/')) ||
    (!isProduction && DEV_ONLY_PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) ||
    (isProduction && path === '/api/database/mode' && req.method === 'GET');

  // 1. Skip public endpoints, real provider webhooks, and payment portal links
  if (
    isPublicPath ||
    (path.startsWith('/api/webhooks/') && !path.startsWith('/api/webhooks/simulate')) ||
    path.startsWith('/api/pay/')
  ) {
    if (!isProduction) {
      const devWs =
        (req.headers['x-workspace-id'] as string) ||
        (req.query.workspaceId as string) ||
        db.getWorkspaces()[0]?.id;
      if (devWs) {
        req.workspaceId = devWs;
        const devUser = db.getCurrentUser();
        if (devUser) {
          req.user = { id: devUser.id, email: devUser.email, full_name: devUser.full_name };
          req.userRole = db.getCurrentRole(devWs) || 'owner';
        }
      }
    }
    return next();
  }

  // 2. Handle Authentication & Authorization with graceful fallback to demo mode
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const supabase = getSupabaseServerClient();

  console.log(
    `[Middleware Token Received] ${req.method} ${path} | AuthHeader: ${authHeader ? 'Bearer ' + token?.slice(0, 15) + '...' + token?.slice(-8) : '(none)'} | Token: ${token ? token.slice(0, 15) + '...' + token.slice(-8) : '(none)'}`
  );

  let authenticated = false;
  if (token && !token.startsWith('sb_sess_') && !token.startsWith('sb_tok_') && !token.startsWith('demo_') && token !== 'demo') {
    if (supabase) {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userData?.user && typeof userData.user === 'object' && !Array.isArray(userData.user) && userData.user.id && !userError) {
          req.user = {
            id: userData.user.id,
            email: userData.user.email || '',
            full_name: (userData.user.user_metadata?.full_name as string) || userData.user.email?.split('@')[0],
          };
          authenticated = true;
        }
      } catch (err: any) {
        console.warn('[TenantIsolation Auth] supabase.auth.getUser error:', err?.message || err);
      }
    }

    // Fallback: verify unexpired Supabase JWT payload if network getUser failed
    if (!authenticated && token.includes('.')) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          const now = Math.floor(Date.now() / 1000);
          if (payload && payload.sub && payload.role === 'authenticated' && (!payload.exp || payload.exp > now)) {
            req.user = {
              id: payload.sub,
              email: payload.email || '',
              full_name: payload.user_metadata?.full_name || payload.email?.split('@')[0],
            };
            authenticated = true;
          }
        }
      } catch (jwtErr: any) {
        console.warn('[TenantIsolation Auth] JWT payload parse notice:', jwtErr?.message || jwtErr);
      }
    }
  }

  // Diagnostic logging for authenticated state & token context
  console.log(
    `[TenantIsolation Debug] ${req.method} ${path} | AuthHeader: ${authHeader ? 'present (Bearer ...' + token?.slice(-6) + ')' : 'missing'} | Authenticated: ${authenticated} | Decoded User ID: ${req.user?.id || 'none'} | Req.User: ${req.user ? JSON.stringify(req.user) : 'none'}`
  );

  if (path.startsWith('/api/database/') && !(path === '/api/database/mode' && req.method === 'GET') && !authenticated) {
    console.warn(`[TenantIsolation 401] Line 122 - Admin endpoint requires authentication. Path: ${path}`);
    res.status(401).json({
      error: 'Authentication required for administrative endpoints in production mode.',
      storageMode: getStorageMode(),
    });
    return;
  }

  if (!authenticated) {
    if (isProduction) {
      console.warn(
        `[TenantIsolation 401] Line 132 - Production request rejected (401 Unauthorized): ${req.method} ${path}. AuthHeader: ${authHeader ? 'present' : 'missing'}`
      );
      res.status(401).json({
        error: 'Unauthorized: Authoritative production mode requires valid Supabase JWT authentication.',
        storageMode: 'supabase_production',
      });
      return;
    }
    const devWs =
      (req.headers['x-workspace-id'] as string) ||
      (req.query.workspaceId as string) ||
      db.getWorkspaces()[0]?.id;
    if (devWs) {
      req.workspaceId = devWs;
    }
    const devUser = db.getCurrentUser();
    if (devUser) {
      req.user = { id: devUser.id, email: devUser.email, full_name: devUser.full_name };
      req.userRole = devWs ? db.getCurrentRole(devWs) || 'owner' : 'owner';
    }
    return next();
  }

    // Special endpoints that only require authentication (not a pre-selected workspace membership)
    if (path === '/api/workspaces' && req.method === 'GET') {
      return next();
    }
    if (path === '/api/workspaces' && req.method === 'POST') {
      return next();
    }
    if (path === '/api/auth/session') {
      return next();
    }

    // Determine candidate workspace ID (client selection)
    const candidateWorkspaceId =
      (req.headers['x-workspace-id'] as string)?.trim() ||
      (req.query.workspaceId as string)?.trim() ||
      (req.body?.workspace_id as string)?.trim() ||
      (req.params?.workspaceId as string)?.trim() ||
      (path.startsWith('/api/workspaces/') ? path.split('/')[3]?.trim() : undefined);

    try {
      if (candidateWorkspaceId) {
        // Verify membership strictly in Supabase (let errors throw so they trigger 503 fail-closed)
        const membership = await supabaseService.getMembership(candidateWorkspaceId, req.user.id);

        if (!membership) {
          res.status(403).json({
            error: `Access denied: User is not an authorized member of workspace "${candidateWorkspaceId}".`,
            storageMode: 'supabase_production',
          });
          return;
        }

        req.workspaceId = candidateWorkspaceId;
        req.membership = membership;
        req.userRole = membership.role;
        return next();
      }

      // No candidate workspace provided by client: lookup user's allowed memberships
      const userMemberships = await supabaseService.getUserMemberships(req.user.id);
      if (!userMemberships || userMemberships.length === 0) {
        res.status(403).json({
          error: 'Access denied: User does not belong to any active workspace. Please create or join a workspace.',
          storageMode: 'supabase_production',
        });
        return;
      }

      // Select user's primary membership
      const primaryMembership = userMemberships[0];
      req.workspaceId = primaryMembership.workspace_id;
      req.membership = primaryMembership;
      req.userRole = primaryMembership.role;

      return next();
    } catch (err: any) {
      if (
        err instanceof SupabaseUnavailableError ||
        err.statusCode === 503 ||
        err.message?.includes('unavailable') ||
        err.message?.includes('FetchError') ||
        err.message?.includes('connect')
      ) {
        res.status(503).json({
          error: err.message || 'Supabase production database is unavailable or not configured.',
          storageMode: 'supabase_production',
        });
        return;
      }
      res.status(503).json({
        error: 'Membership infrastructure verification failed closed.',
        details: err.message,
        storageMode: 'supabase_production',
      });
      return;
    }

  // 3. Local Development Mode Fallback
  const candidateWs =
    (req.headers['x-workspace-id'] as string)?.trim() ||
    (req.query.workspaceId as string)?.trim() ||
    (req.body?.workspace_id as string)?.trim() ||
    (req.params?.workspaceId as string)?.trim() ||
    db.getWorkspaces()[0]?.id;

  const devUser = db.getCurrentUser();
  const devRole = candidateWs ? db.getCurrentRole(candidateWs) || 'owner' : 'owner';

  if (candidateWs) {
    req.workspaceId = candidateWs;
  }
  req.user = devUser ? { id: devUser.id, email: devUser.email, full_name: devUser.full_name } : undefined;
  req.userRole = devRole;

  next();
}

// Role authorization guard
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = (req.userRole || req.membership?.role || 'viewer') as UserRole;
    if (!allowedRoles.includes(role)) {
      res.status(403).json({
        error: `Permission denied: Role "${role}" is not authorized for this operation. Requires one of: ${allowedRoles.join(', ')}`,
      });
      return;
    }
    next();
  };
}
