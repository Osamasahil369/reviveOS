import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, UserRole, AuthSession, RlsTestResult } from '../types/index.js';

// Environment variables or development placeholder fallback
const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
let supabaseUrl =
  metaEnv?.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';

let supabaseAnonKey =
  metaEnv?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder_anon_key';

export let isUsingPlaceholderCredentials =
  supabaseUrl.includes('placeholder-project') || supabaseAnonKey.includes('placeholder');

// Initialize real Supabase client
console.log('supabaseAnonKey.substring(0,30):', supabaseAnonKey.substring(0, 30));
export let supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Diagnostic helper for all fetch endpoints in supabase.ts
export async function authFetchJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; status: number; contentType: string }> {
  try {
    const headers = (options.headers as Record<string, string>) || {};
    const method = options.method || 'GET';
    console.log(
      `[Auth Outgoing Request] ${method} ${url} | Authorization: ${headers['Authorization'] ? 'Bearer ' + headers['Authorization'].slice(7, 22) + '...' + headers['Authorization'].slice(-8) : '(none)'}`
    );
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    console.log(`[Auth Fetch] 2. Response Status: ${res.status} ${res.statusText}`);
    console.log(`[Auth Fetch] 3. Content-Type: ${contentType}`);

    const rawText = await res.text();
    console.log(`[Auth Fetch] 4. Response Body: ${rawText.slice(0, 300)}`);

    if (
      contentType.includes('text/html') ||
      rawText.trim().startsWith('<!doctype') ||
      rawText.trim().startsWith('<!DOCTYPE') ||
      rawText.trim().startsWith('<html') ||
      rawText.trim().startsWith('<HTML') ||
      rawText.trim().startsWith('<')
    ) {
      console.warn(`[Auth Fetch Notice] Endpoint ${url} returned HTML instead of JSON. Status: ${res.status}`);
      return {
        data: null,
        error: `Server endpoint ${url} returned HTML (${res.status}). Verify API routing.`,
        status: res.status,
        contentType,
      };
    }

    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr: any) {
      console.warn(`[Auth Fetch Notice] Non-JSON payload received from ${url}:`, parseErr);
      return {
        data: null,
        error: `Invalid JSON response from ${url}`,
        status: res.status,
        contentType,
      };
    }

    if (!res.ok) {
      return {
        data: null,
        error: parsed?.error || `HTTP error ${res.status}`,
        status: res.status,
        contentType,
      };
    }

    return {
      data: parsed as T,
      error: null,
      status: res.status,
      contentType,
    };
  } catch (netErr: any) {
    console.warn(`[Auth Fetch Network Notice] ${url}:`, netErr);
    return {
      data: null,
      error: netErr?.message || 'Network error',
      status: 0,
      contentType: '',
    };
  }
}

let configPromise: Promise<void> | null = null;
export async function initClientSupabaseConfig(): Promise<void> {
  if (!isUsingPlaceholderCredentials) return;
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const { data: cfg, error } = await authFetchJson<{ supabaseUrl?: string; supabaseAnonKey?: string }>(
          '/api/auth/config'
        );
        if (!error && cfg?.supabaseUrl && cfg?.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('sb_secret_')) {
          supabaseUrl = cfg.supabaseUrl;
          supabaseAnonKey = cfg.supabaseAnonKey;
          isUsingPlaceholderCredentials = false;
          console.log('supabaseAnonKey.substring(0,30):', supabaseAnonKey.substring(0, 30));
          supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
            },
          });
        }
      } catch (err) {
        console.warn('[Client Auth Config] Initialization notice:', err);
      }
    })();
  }
  await configPromise;
}

let activeAuthToken: string | null = null;

export const setActiveAuthToken = (token: string | null) => {
  activeAuthToken = token;
  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem('sb_auth_token', token);
      sessionStorage.setItem('sb_auth_token', token);
    } else {
      localStorage.removeItem('sb_auth_token');
      sessionStorage.removeItem('sb_auth_token');
    }
  }
};

export const getActiveAuthToken = () => {
  if (activeAuthToken) return activeAuthToken;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('sb_auth_token') || sessionStorage.getItem('sb_auth_token');
  }
  return null;
};

export async function getCurrentAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      setActiveAuthToken(data.session.access_token);
      return data.session.access_token;
    }
  } catch {}
  if (activeAuthToken) {
    return activeAuthToken;
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('sb_auth_token') || sessionStorage.getItem('sb_auth_token');
    if (stored) {
      activeAuthToken = stored;
      return stored;
    }
  }
  return null;
}

/**
 * Authoritative, RLS-safe user profile bootstrap mechanism.
 * Invokes public.ensure_my_profile() RPC with active session.
 */
export async function ensureMyProfile(): Promise<User> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session) {
    throw new Error('Please sign in to continue.');
  }

  const { data, error } = await supabase.rpc('ensure_my_profile');
  if (error) {
    console.error('[Profile Bootstrap] ensure_my_profile RPC error:', error);
    if (
      error.message?.includes('violates row-level security') ||
      error.message?.includes('row-level security policy') ||
      error.message?.includes('table "users"') ||
      error.message?.includes("table 'users'")
    ) {
      throw new Error("We couldn't finish setting up your account. Please try again.");
    }
    throw new Error(error.message || "We couldn't finish setting up your account. Please try again.");
  }
  return data as User;
}

// Full-stack auth integration bridging Supabase Auth & Multi-tenant backend
export const supabaseAuth = {
  async getSession(): Promise<AuthSession> {
    await initClientSupabaseConfig();
    const wsId = typeof localStorage !== 'undefined' ? localStorage.getItem('recovery_os_workspace_id') || '' : '';

    try {
      // 1. Primary source of truth: Supabase client active session
      const token = await getCurrentAccessToken();

      // 2. Query session endpoint
      const headers: Record<string, string> = {};
      if (wsId) headers['x-workspace-id'] = wsId;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const { data: session, error } = await authFetchJson<AuthSession>('/api/auth/session', { headers });
      if (error || !session) {
        return {
          user: null,
          role: null,
          workspace_id: wsId || '',
          is_authenticated: false,
        };
      }
      if (token) {
        session.token = token;
        activeAuthToken = token;
      } else if (session?.token) {
        activeAuthToken = session.token;
      }
      if (session?.workspace_id && typeof localStorage !== 'undefined') {
        localStorage.setItem('recovery_os_workspace_id', session.workspace_id);
      }
      return session;
    } catch (err) {
      return {
        user: null,
        role: null,
        workspace_id: wsId || '',
        is_authenticated: false,
      };
    }
  },

  async signIn(email: string, password?: string): Promise<AuthSession> {
    if (!password) {
      throw new Error('Password is required.');
    }

    await initClientSupabaseConfig();

    if (!isUsingPlaceholderCredentials) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw new Error(error.message || 'Authentication failed');
      }

      if (!data.session) {
        throw new Error('Sign in succeeded but no active session was returned. Please confirm your email.');
      }

      if (data.session.access_token) {
        activeAuthToken = data.session.access_token;
      }

      // Normal browser authentication delegates profile sync to trusted server session bootstrap
      return this.getSession();
    }

    // Local / development fallback
    const { data: session, error } = await authFetchJson<AuthSession>('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (error || !session) {
      throw new Error(error || 'Failed to sign in');
    }
    if (session.token) {
      activeAuthToken = session.token;
      try {
        await supabase.auth.setSession({ access_token: session.token, refresh_token: '' });
      } catch {}
    }
    return session;
  },

  async signUp(email: string, fullName: string, password?: string): Promise<AuthSession & { message?: string }> {
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const trimmedEmail = email.trim().toLowerCase();
    const displayName = fullName.trim() || trimmedEmail.split('@')[0];

    await initClientSupabaseConfig();

    if (!isUsingPlaceholderCredentials) {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: displayName,
          },
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to sign up');
      }

      // CASE A: Active session granted immediately
      if (data.session) {
        if (data.session.access_token) {
          activeAuthToken = data.session.access_token;
        }
        // Normal browser authentication delegates profile sync to trusted server session bootstrap
        return this.getSession();
      }

      // CASE B: Email confirmation required
      return {
        user: {
          id: data.user?.id || '',
          email: data.user?.email || trimmedEmail,
          full_name: displayName,
        },
        role: null,
        workspace_id: '',
        is_authenticated: false,
        message: 'Account created. Please check your email to confirm your account.',
      };
    }

    const { data: session, error } = await authFetchJson<AuthSession & { message?: string }>('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, fullName: displayName, password }),
    });
    if (error || !session) {
      throw new Error(error || 'Failed to sign up');
    }
    if (session.token) {
      activeAuthToken = session.token;
      try {
        await supabase.auth.setSession({ access_token: session.token, refresh_token: '' });
      } catch {}
    }
    return session;
  },

  async launchDemoSession(): Promise<AuthSession> {
    await initClientSupabaseConfig();
    const { data: session, error } = await authFetchJson<AuthSession & { is_demo?: boolean }>('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (error || !session || !session.token) {
      // Fallback: try direct sign in
      return this.signIn('demo.operator@reviveos.internal', 'ReviveOS!Demo2026');
    }

    activeAuthToken = session.token;
    try {
      await supabase.auth.setSession({ access_token: session.token, refresh_token: '' });
    } catch {}

    if (session.workspace_id && typeof localStorage !== 'undefined') {
      localStorage.setItem('recovery_os_workspace_id', session.workspace_id);
    }

    return session;
  },

  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch {}

    try {
      const token = await getCurrentAccessToken();
      await authFetchJson('/api/auth/signout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('recovery_os_workspace_id');
      localStorage.removeItem('recovery_os_token');
    }
  },

  async switchUser(userId: string): Promise<AuthSession> {
    const { data: session, error } = await authFetchJson<AuthSession>('/api/auth/switch-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (error || !session) throw new Error(error || 'Failed to switch user');
    return session;
  },

  async switchRole(role: UserRole): Promise<AuthSession> {
    const { data: session, error } = await authFetchJson<AuthSession>('/api/auth/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (error || !session) throw new Error(error || 'Failed to switch role');
    return session;
  },

  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!isUsingPlaceholderCredentials) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw new Error(error.message);
      return { success: true, message: 'If an account exists, a password reset link has been dispatched.' };
    }
    const { data, error } = await authFetchJson<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (error) {
      throw new Error(error || 'Failed to send password reset request');
    }
    return { success: true, message: data?.message || 'If an account exists, a password reset link has been dispatched.' };
  },

  async testRlsPolicy(table: string, action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE', targetWorkspaceId?: string): Promise<RlsTestResult> {
    const token = await getCurrentAccessToken();
    const { data, error } = await authFetchJson<RlsTestResult>('/api/auth/rls-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ table, action, targetWorkspaceId }),
    });
    if (error || !data) throw new Error(error || 'Failed to test RLS policy');
    return data;
  },
};
