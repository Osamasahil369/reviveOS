import crypto from 'crypto';
import { isSupabaseAuthoritative } from '../db/storageMode.js';

function getEncryptionKey(): Buffer {
  const masterSecret = process.env.PROVIDER_SECRET_ENCRYPTION_KEY;

  if (!masterSecret) {
    if (process.env.NODE_ENV === 'production' || isSupabaseAuthoritative()) {
      throw new Error(
        'CRITICAL SECURITY CONFIGURATION: PROVIDER_SECRET_ENCRYPTION_KEY environment variable is required in production mode for secret encryption.'
      );
    }
    // Explicit local development encryption key with warning
    return crypto.scryptSync('revenue-recovery-os-local-dev-key-do-not-use-in-production', 'rros-salt-dev-v2', 32);
  }

  return crypto.scryptSync(masterSecret, 'revenue-recovery-os-salt-v1', 32);
}

/**
 * Encrypt a plaintext secret using AES-256-GCM authenticated encryption.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `gcm_${iv.toString('hex')}_${authTag}_${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted secret.
 * Backwards compatible with legacy enc_ base64 strings during migration.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  
  // AES-256-GCM format
  if (cipherText.startsWith('gcm_')) {
    try {
      const parts = cipherText.split('_');
      if (parts.length === 4) {
        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encrypted = parts[3];
        
        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch (err) {
      console.error('[Encryption] Failed to decrypt AES-256-GCM secret:', err);
      return '';
    }
  }
  
  // Legacy base64 fallback during migration
  if (cipherText.startsWith('enc_')) {
    try {
      const base64 = cipherText.slice(4);
      return Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }

  // Plaintext (not recommended, but return as-is if unencrypted)
  return cipherText;
}

/**
 * Hashes a raw bearer token using SHA-256 for secure DB lookup and storage.
 */
export function hashToken(token: string): string {
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mask a secret so it can be safely sent to the UI without leaking sensitive tokens.
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  const clean = secret.trim();
  if (clean.length <= 8) {
    return '••••••••';
  }
  const prefix = clean.slice(0, Math.min(7, Math.floor(clean.length / 3)));
  const suffix = clean.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

/**
 * Recursively redacts sensitive keys and values (tokens, cards, API keys, secrets) from objects/metadata.
 */
export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'number' || typeof data === 'boolean') return data;

  if (typeof data === 'string') {
    let sanitized = data.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]');
    sanitized = sanitized.replace(/\/pay\/[a-f0-9]{32,}/gi, '/pay/[REDACTED_TOKEN]');
    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === 'object') {
    const sensitiveKeys = [
      'token',
      'rawtoken',
      'raw_token',
      'recoverytoken',
      'recovery_token',
      'apikey',
      'api_key',
      'apisecret',
      'api_secret',
      'secret',
      'webhooksecret',
      'webhook_secret',
      'cardnumber',
      'card_number',
      'pan',
      'cvc',
      'cvv',
      'password',
    ];

    const redactedObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey === s)) {
        redactedObj[key] = '[REDACTED]';
      } else {
        redactedObj[key] = redactSensitiveData(val);
      }
    }
    return redactedObj;
  }

  return data;
}
