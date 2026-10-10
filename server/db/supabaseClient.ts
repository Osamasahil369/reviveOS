import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getStorageMode, isSupabaseAuthoritative } from './storageMode.js';

export function normalizeSupabaseEnv(): void {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const rawAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // 1. Identify publishable / anon key
  let publishableKey = '';
  if (rawUrl.startsWith('sb_publishable_')) {
    publishableKey = rawUrl;
  } else if (rawAnon.startsWith('sb_publishable_')) {
    publishableKey = rawAnon;
  } else if (rawAnon && !rawAnon.startsWith('sb_secret_') && !rawAnon.includes('placeholder')) {
    publishableKey = rawAnon;
  }

  // 2. Identify secret / service_role key
  let secretKey = rawService;
  if (!secretKey && rawAnon.startsWith('sb_secret_')) {
    secretKey = rawAnon;
  }

  // 3. Resolve canonical Supabase URL
  let trueUrl = '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    trueUrl = rawUrl;
  } else if (secretKey && secretKey.includes('.')) {
    try {
      const parts = secretKey.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload?.ref) {
          trueUrl = `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {}
  }

  if (trueUrl) {
    process.env.SUPABASE_URL = trueUrl;
    process.env.VITE_SUPABASE_URL = trueUrl;
  }
  if (publishableKey) {
    process.env.SUPABASE_ANON_KEY = publishableKey;
    process.env.VITE_SUPABASE_ANON_KEY = publishableKey;
  } else if (rawAnon.startsWith('sb_secret_')) {
    // If anon key had secret key and no publishable key is available, clear anon key so secret is never exposed to browser
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  }
  if (secretKey) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = secretKey;
  }

  console.log('[Supabase Runtime Config Loaded]');
  console.log('  SUPABASE_URL:', (process.env.SUPABASE_URL || '(none)'));
  console.log('  SUPABASE_ANON_KEY (first 20):', (process.env.SUPABASE_ANON_KEY || '(none)').substring(0, 20));
  console.log('  VITE_SUPABASE_ANON_KEY (first 20):', (process.env.VITE_SUPABASE_ANON_KEY || '(none)').substring(0, 20));
  console.log('  SUPABASE_SERVICE_ROLE_KEY (first 20):', (process.env.SUPABASE_SERVICE_ROLE_KEY || '(none)').substring(0, 20));
}

// Run normalization immediately on module evaluation
normalizeSupabaseEnv();

export function getSupabaseUrl(): string {
  const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl;
  }
  // If SUPABASE_URL was provided as a publishable key or reference, reconstruct from service role key or anon key JWT
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (key && key.includes('.')) {
    try {
      const parts = key.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload?.ref) {
          return `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {}
  }
  return envUrl;
}

export function getSupabaseKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder')) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  // In development only, allow anon key with a warning
  if (process.env.NODE_ENV !== 'production' && !isSupabaseAuthoritative()) {
    return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  }
  return '';
}

export function isSupabaseConfigured(): boolean {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key || rawUrl.includes('placeholder') || key.includes('placeholder')) {
    return false;
  }
  const url = getSupabaseUrl();
  return Boolean(
    url &&
    key &&
    url.startsWith('http')
  );
}

let adminClient: SupabaseClient | null = null;
let clientOverride: any | null = null;

export function setSupabaseServerClientOverride(override: any | null): void {
  clientOverride = override;
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (clientOverride) {
    return clientOverride;
  }
  const url = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (isSupabaseAuthoritative() && (!url || !serviceRoleKey || serviceRoleKey.includes('placeholder'))) {
    console.error('[Supabase Security] Privileged server operations require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return null;
  }

  const key = serviceRoleKey || getSupabaseKey();

  if (!url || !key || !url.startsWith('http') || url.includes('placeholder')) {
    return null;
  }

  if (!adminClient) {
    try {
      adminClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch (err) {
      console.warn('[Supabase] Failed to initialize Supabase server client:', err);
      return null;
    }
  }
  return adminClient;
}

export function getSupabaseUserClient(jwtToken: string): SupabaseClient | null {
  const url = getSupabaseUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !url.startsWith('http') || anonKey.includes('placeholder')) {
    return null;
  }

  try {
    return createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
    });
  } catch (err) {
    console.warn('[Supabase] Failed to initialize user Supabase client:', err);
    return null;
  }
}

export interface DatabaseStatus {
  activeStorageMode: 'local_development' | 'supabase_production';
  storageEngine: 'supabase_production' | 'supabase_production_offline' | 'local_development_json';
  isProduction: boolean;
  isAuthoritative: boolean;
  isSupabaseConnected: boolean;
  supabaseConfigured: boolean;
  supabaseUrlConfigured: boolean;
  targetProjectUrl: string;
  errorMessage?: string | null;
  filePath: string;
  fileSizeBytes: number;
  lastPersistedAt: string | null;
  tableCounts: Record<string, number>;
}
