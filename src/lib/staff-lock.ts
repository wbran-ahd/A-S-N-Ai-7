/**
 * PIN lock & سیلز مین موڈ — local, offline, owner-controlled.
 *
 * The PIN never leaves the device: a random salt plus a SHA-256 hash are stored
 * in localStorage, and the hash is only ever used for local comparison. This is
 * a shop-floor convenience lock (it stops a helper from opening settings or
 * deleting entries), not a replacement for the account password — the honest
 * wording is used in the UI too.
 *
 * Brute-force brake (task 7): a 4-digit PIN is only 10,000 guesses, so after
 * `MAX_PIN_FAILURES` wrong tries the lock stops answering for `PIN_LOCKOUT_MS`.
 * The counter and the deadline live in the same record, which means they cannot
 * be reset by simply closing the app — only by clearing browser data (a
 * shopkeeper's own device, which is out of scope for a convenience lock).
 */
export type StaffMode = "owner" | "staff";

type LockRecord = {
  version: 1;
  salt: string;
  hash: string;
  mode: StaffMode;
  /** Consecutive wrong PINs since the last success. */
  failures?: number;
  /** Epoch ms until which every answer is "wrong", whatever is typed. */
  lockedUntil?: number;
};

export const STAFF_LOCK_STORAGE_KEY = "sautiStaffLock";
/** Wrong tries allowed before the brake engages. */
export const MAX_PIN_FAILURES = 5;
/** How long the brake lasts, in milliseconds. */
export const PIN_LOCKOUT_MS = 60_000;

/** 4–8 digits: long enough to be useful, short enough to type on a keypad. */
export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin ?? "");
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Salted SHA-256 of the PIN. Exported so the verification script can prove it. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function readRecord(): LockRecord | null {
  try {
    const raw = localStorage.getItem(STAFF_LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof parsed?.salt !== "string" || typeof parsed?.hash !== "string") return null;
    return {
      version: 1,
      salt: parsed.salt,
      hash: parsed.hash,
      mode: parsed.mode === "staff" ? "staff" : "owner",
      failures: typeof parsed.failures === "number" ? parsed.failures : 0,
      lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : 0,
    };
  } catch {
    return null;
  }
}

function writeRecord(record: LockRecord | null) {
  try {
    if (record === null) localStorage.removeItem(STAFF_LOCK_STORAGE_KEY);
    else localStorage.setItem(STAFF_LOCK_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* ignore — the lock simply is not persisted */
  }
}

export function lockState(): { hasPin: boolean; mode: StaffMode } {
  const record = readRecord();
  return { hasPin: record !== null, mode: record?.mode ?? "owner" };
}

/**
 * How many attempts are left, and whether the brake is currently on. The UI
 * reads this to explain itself ("4 کوششیاں باقی") instead of silently failing.
 */
export function pinGuardState(now = Date.now()): {
  lockedForMs: number;
  remainingTries: number;
} {
  const record = readRecord();
  if (!record) return { lockedForMs: 0, remainingTries: MAX_PIN_FAILURES };
  const lockedForMs = Math.max(0, (record.lockedUntil ?? 0) - now);
  const failures = lockedForMs > 0 ? MAX_PIN_FAILURES : (record.failures ?? 0);
  return { lockedForMs, remainingTries: Math.max(0, MAX_PIN_FAILURES - failures) };
}

/** Sets (or replaces) the PIN and returns to owner mode. */
export async function createPin(pin: string): Promise<boolean> {
  if (!validPin(pin)) return false;
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  writeRecord({ version: 1, salt, hash, mode: "owner", failures: 0, lockedUntil: 0 });
  return true;
}

/**
 * Compares a PIN and maintains the brake.
 *
 * While locked, the comparison is skipped entirely (so even the right PIN is
 * refused until the deadline), which is what makes the limit meaningful.
 */
export async function checkPin(pin: string, now = Date.now()): Promise<boolean> {
  const record = readRecord();
  if (!record || !validPin(pin)) return false;

  if ((record.lockedUntil ?? 0) > now) return false;

  const matches = (await hashPin(pin, record.salt)) === record.hash;
  if (matches) {
    writeRecord({ ...record, failures: 0, lockedUntil: 0 });
    return true;
  }

  const failures = (record.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_PIN_FAILURES ? now + PIN_LOCKOUT_MS : 0;
  writeRecord({
    ...record,
    failures: lockedUntil > 0 ? 0 : failures,
    lockedUntil,
  });
  return false;
}

export function setStaffMode(mode: StaffMode) {
  const record = readRecord();
  if (!record) return;
  writeRecord({ ...record, mode });
}

export function removePin() {
  writeRecord(null);
}
