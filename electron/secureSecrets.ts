/**
 * OS-backed secret storage for cloud credentials in SQLite settings.
 *
 * Uses Electron safeStorage (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 * Values are stored as `ss1:<base64>` ciphertext; legacy plaintext rows are migrated on read.
 */
import { safeStorage } from 'electron';

const ENCRYPTED_PREFIX = 'ss1:';

export const SECRET_SETTING_KEYS = ['cloud_access_token'] as const;

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number];

export function isSecretSettingKey(key: string): key is SecretSettingKey {
  return (SECRET_SETTING_KEYS as readonly string[]).includes(key);
}

let encryptionUnavailableLogged = false;

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function logEncryptionUnavailableOnce(): void {
  if (encryptionUnavailableLogged) return;
  encryptionUnavailableLogged = true;
  console.warn(
    '[Secrets] safeStorage unavailable — cloud JWT stored as plaintext in SQLite',
  );
}

function isEncryptedValue(stored: string): boolean {
  return stored.startsWith(ENCRYPTED_PREFIX);
}

function encodeEncrypted(plain: string): string {
  const buf = safeStorage.encryptString(plain);
  return ENCRYPTED_PREFIX + buf.toString('base64');
}

function decodeEncrypted(stored: string): string {
  return safeStorage.decryptString(Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64'));
}

export function readSecretSetting(db: any, key: SecretSettingKey): string | null {
  if (!db) return null;
  try {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!r?.value) return null;
    const raw = r.value;
    if (!isEncryptedValue(raw)) {
      if (encryptionAvailable()) {
        writeSecretSetting(db, key, raw);
      }
      return raw;
    }
    if (!encryptionAvailable()) {
      console.error(`[Secrets] Cannot decrypt ${key}: safeStorage unavailable`);
      return null;
    }
    try {
      return decodeEncrypted(raw);
    } catch (e) {
      console.error(`[Secrets] Failed to decrypt ${key}:`, e);
      return null;
    }
  } catch (e) {
    console.warn(`[Secrets] readSecretSetting(${key}) failed:`, e);
    return null;
  }
}

export function writeSecretSetting(db: any, key: SecretSettingKey, plain: string): void {
  if (!db) return;
  const trimmed = (plain ?? '').trim();
  if (!trimmed) {
    clearSecretSetting(db, key);
    return;
  }
  let stored = trimmed;
  if (encryptionAvailable()) {
    try {
      stored = encodeEncrypted(trimmed);
    } catch (e) {
      console.warn(`[Secrets] encrypt ${key} failed, storing plaintext:`, e);
      logEncryptionUnavailableOnce();
    }
  } else {
    logEncryptionUnavailableOnce();
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stored);
}

export function clearSecretSetting(db: any, key: SecretSettingKey): void {
  if (!db) return;
  try {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } catch (e) {
    console.warn(`[Secrets] clearSecretSetting(${key}) failed:`, e);
  }
}

/** One-shot migration for machines paired before safeStorage was enabled. */
export function migratePlaintextSecrets(db: any): void {
  if (!db || !encryptionAvailable()) return;
  for (const key of SECRET_SETTING_KEYS) {
    try {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      if (!r?.value || isEncryptedValue(r.value)) continue;
      writeSecretSetting(db, key, r.value);
      console.log(`[Secrets] Migrated ${key} to safeStorage`);
    } catch (e) {
      console.warn(`[Secrets] migrate ${key} failed:`, e);
    }
  }
}
