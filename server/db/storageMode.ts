export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
    return false;
  }
  if (url.startsWith('http')) {
    return true;
  }
  // If SUPABASE_URL was provided as a publishable key or reference, check if project URL can be resolved from service role key
  if (key.includes('.')) {
    try {
      const parts = key.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload?.ref) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

export type StorageMode = 'local_development' | 'supabase_production';

function determineInitialStorageMode(): StorageMode {
  if (process.env.NODE_ENV === 'production') {
    if (!isSupabaseConfigured()) {
      throw new Error('CRITICAL CONFIGURATION ERROR: Supabase production database required.');
    }
    return 'supabase_production';
  }

  if (process.env.STORAGE_MODE === 'supabase_production') {
    if (!isSupabaseConfigured()) {
      throw new Error('CRITICAL CONFIGURATION ERROR: Supabase production database required.');
    }
    return 'supabase_production';
  }

  return 'local_development';
}

// In production, storage mode is ALWAYS supabase_production.
let activeStorageMode: StorageMode = determineInitialStorageMode();

export function getStorageMode(): StorageMode {
  if (process.env.NODE_ENV === 'production') {
    if (!isSupabaseConfigured()) {
      throw new Error('CRITICAL CONFIGURATION ERROR: Supabase production database required.');
    }
    return 'supabase_production';
  }
  return activeStorageMode;
}

export function setStorageMode(mode: StorageMode): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL CONFIGURATION ERROR: Storage mode cannot be changed in production: Supabase production database required.');
  }
  if (mode !== 'local_development' && mode !== 'supabase_production') {
    throw new Error(`Invalid storage mode "${mode}". Supported: "local_development", "supabase_production"`);
  }
  if (mode === 'supabase_production' && !isSupabaseConfigured()) {
    throw new Error('CRITICAL CONFIGURATION ERROR: Supabase production database required.');
  }
  activeStorageMode = mode;
  console.log(`[StorageMode] Active storage mode updated to: ${activeStorageMode}`);
}

export function isSupabaseAuthoritative(): boolean {
  return getStorageMode() === 'supabase_production';
}



