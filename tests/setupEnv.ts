import dotenv from 'dotenv';
dotenv.config({ override: true });

if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_URL.startsWith('http') ||
  process.env.SUPABASE_URL.includes('placeholder') ||
  process.env.SUPABASE_URL.includes('your-project')
) {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
}
if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder') ||
  process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your_supabase')
) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_abcdef1234567890';
}
if (
  !process.env.PROVIDER_SECRET_ENCRYPTION_KEY ||
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY.includes('replace_with')
) {
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY = '01234567890123456789012345678901';
}
if (!process.env.REVIVEOS_PUBLIC_URL) {
  process.env.REVIVEOS_PUBLIC_URL = 'https://reviveos.app';
}

// Fast in-memory fetch mock for test.supabase.co in test environment to avoid real network timeouts
const origFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
  if (url.includes('test.supabase.co')) {
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ message: 'Invalid JWT' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/rest/v1/rpc/ensure_my_profile')) {
      return new Response(JSON.stringify({
        id: 'usr_test_auth_123',
        email: 'owner@saas.io',
        full_name: 'SaaS Founder',
        created_at: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/rest/v1/users')) {
      let record: any = {};
      try {
        if (init?.body) {
          const raw = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          record = Array.isArray(raw) ? raw[0] : raw;
        }
      } catch {}
      const userObj = {
        id: record?.id || 'usr_mock_1',
        email: record?.email || 'user@example.com',
        full_name: record?.full_name || 'Mock User',
        created_at: new Date().toISOString(),
      };
      let accept = '';
      if (init?.headers) {
        if (typeof (init.headers as any).get === 'function') {
          accept = (init.headers as any).get('accept') || (init.headers as any).get('Accept') || '';
        } else {
          accept = (init.headers as any)['accept'] || (init.headers as any)['Accept'] || '';
        }
      }
      const isSingle = typeof accept === 'string' && accept.includes('vnd.pgrst.object+json');
      return new Response(JSON.stringify(isSingle ? userObj : [userObj]), {
        status: 200,
        headers: {
          'Content-Type': isSingle ? 'application/vnd.pgrst.object+json' : 'application/json',
          'content-range': '0-0/1',
        },
      });
    }
    if (url.includes('provider_connections')) {
      const { db } = await import('../server/store/db.ts');
      const conns = db.getProviderConnections();
      return new Response(JSON.stringify(conns), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'content-range': `0-${conns.length}/${conns.length}` },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'content-range': '0-0/0' },
    });
  }
  return origFetch(input, init);
};

