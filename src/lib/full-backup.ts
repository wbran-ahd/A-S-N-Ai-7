/**
 * مکمل بیک اپ — one portable file with everything this device knows.
 *
 * Why this exists
 * ---------------
 * Cloud sync signs the device in anonymously, so the Firestore copy is tied to
 * that device's uid. If the phone is lost, replaced or the browser storage is
 * cleared, the cloud copy is unreachable — there is no account to sign back in
 * with. That made the P0 review's "recovery without an account" gap real.
 *
 * The remedy is a self-contained file the shopkeeper can keep on a phone, a
 * memory card, WhatsApp or a USB stick: ledger, prefs, budgets, recurring rules
 * and the whole customer/supplier book. Restoring it needs no network and no
 * account.
 *
 * Design rules
 * ------------
 * • Every value is validated before anything is written, so a corrupt file can
 *   never half-restore a ledger.
 * • Storage keys are written directly (the same keys the app already reads), and
 *   the caller reloads afterwards. That keeps this module free of React state
 *   and guarantees the whole UI sees the restored data at once.
 * • Nothing here touches Firestore or any network endpoint.
 */
import {
  PREF_STORAGE_KEY,
  STORAGE_KEY,
  clampTtsRate,
  sanitizeImportedEntries,
  type Budget,
  type DigitStyle,
  type Entry,
  type Prefs,
  type RecurringEntry,
} from "./khata";
import { PARTY_STORAGE_KEY, partyBookFromJson, type PartyBook } from "./parties";

export const FULL_BACKUP_APP = "sauti-baqaya";
export const FULL_BACKUP_VERSION = 1;
/** Hard cap for a restore file — this format is a few hundred KB at most. */
export const MAX_FULL_BACKUP_BYTES = 8 * 1024 * 1024;

const BUDGETS_KEY = "sauti_local_budgets";
const RECURRING_KEY = "sauti_local_recurring";

export type FullBackup = {
  app: typeof FULL_BACKUP_APP;
  version: number;
  exportedAt: string;
  ledger: { income: Entry[]; expense: Entry[] };
  prefs: Prefs;
  budgets: Budget[];
  recurring: RecurringEntry[];
  partyBook: PartyBook;
};

export type FullBackupRestore = {
  income: number;
  expense: number;
  parties: number;
  partyTxns: number;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readPrefs(): Prefs {
  const stored = readJson<Partial<Prefs>>(PREF_STORAGE_KEY, {});
  const applied =
    stored.appliedRecurring && typeof stored.appliedRecurring === "object"
      ? stored.appliedRecurring
      : {};
  return {
    digitStyle: stored.digitStyle === "eastern" ? "eastern" : "latin",
    appliedRecurring: applied,
    ttsEnabled: stored.ttsEnabled !== false,
    ttsRate: clampTtsRate(stored.ttsRate),
  };
}

function readPartyBook(): PartyBook {
  try {
    const raw = localStorage.getItem(PARTY_STORAGE_KEY);
    if (!raw) return { parties: [], txns: [] };
    return partyBookFromJson(raw);
  } catch {
    return { parties: [], txns: [] };
  }
}

/** Snapshot of everything stored on this device. */
export function buildFullBackup(now: Date = new Date()): FullBackup {
  const ledger = readJson<{ income?: unknown; expense?: unknown }>(STORAGE_KEY, {});
  const income = Array.isArray(ledger.income) ? (ledger.income as Entry[]) : [];
  const expense = Array.isArray(ledger.expense) ? (ledger.expense as Entry[]) : [];

  return {
    app: FULL_BACKUP_APP,
    version: FULL_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    ledger: { income, expense },
    prefs: readPrefs(),
    budgets: readJson<Budget[]>(BUDGETS_KEY, []),
    recurring: readJson<RecurringEntry[]>(RECURRING_KEY, []),
    partyBook: readPartyBook(),
  };
}

export function fullBackupJson(backup: FullBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function fullBackupFileName(now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return `sauti-baqaya-full-backup-${stamp}.json`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isDigitStyle(value: unknown): value is DigitStyle {
  return value === "latin" || value === "eastern";
}

function normalisePrefs(value: unknown): Prefs {
  const raw = (value ?? {}) as Partial<Prefs>;
  const applied: Record<string, string[]> = {};
  if (raw.appliedRecurring && typeof raw.appliedRecurring === "object") {
    for (const [monthKey, keys] of Object.entries(raw.appliedRecurring)) {
      if (!Array.isArray(keys)) continue;
      applied[monthKey] = keys.filter((key): key is string => typeof key === "string");
    }
  }
  return {
    digitStyle: isDigitStyle(raw.digitStyle) ? raw.digitStyle : "latin",
    appliedRecurring: applied,
    ttsEnabled: raw.ttsEnabled !== false,
    ttsRate: clampTtsRate(raw.ttsRate),
  };
}

function normaliseBudgets(value: unknown): Budget[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const budgets: Budget[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Partial<Budget>;
    if (typeof candidate.category !== "string" || !candidate.category.trim()) continue;
    if (typeof candidate.limit !== "number" || !Number.isFinite(candidate.limit)) continue;
    if (candidate.limit <= 0) continue;
    const category = candidate.category.trim();
    if (seen.has(category)) continue;
    seen.add(category);
    budgets.push({ category, limit: Math.round(candidate.limit) });
  }
  return budgets;
}

function normaliseRecurring(value: unknown): RecurringEntry[] {
  if (!Array.isArray(value)) return [];
  const recurring: RecurringEntry[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Partial<RecurringEntry>;
    if (typeof candidate.id !== "string" || !candidate.id) continue;
    if (typeof candidate.label !== "string" || !candidate.label.trim()) continue;
    if (typeof candidate.amount !== "number" || !Number.isFinite(candidate.amount)) continue;
    if (candidate.amount <= 0) continue;
    recurring.push({
      id: candidate.id,
      label: candidate.label.trim(),
      amount: Math.round(candidate.amount),
      enabled: candidate.enabled !== false,
      kind: candidate.kind === "expense" ? "expense" : "income",
    });
  }
  return recurring;
}

/**
 * Restores a file written by {@link buildFullBackup}.
 *
 * Throws a Urdu error when the file is not a صوتی بقیہ backup or contains no
 * usable records — the caller shows the message and leaves storage untouched.
 */
export function restoreFullBackup(text: string, now: Date = new Date()): FullBackupRestore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("یہ فائل JSON نہیں ہے — مکمل بیک اپ کی .json فائل منتخب کریں۔");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("بیک اپ فائل خالی یا خراب ہے۔");
  }

  const raw = parsed as Partial<FullBackup> & { ledger?: unknown };
  if (raw.app !== undefined && raw.app !== FULL_BACKUP_APP) {
    throw new Error("یہ صوتی بقیہ کا بیک اپ نہیں ہے۔");
  }

  const ledger = (raw.ledger ?? raw) as { income?: unknown; expense?: unknown };
  const income = sanitizeImportedEntries(ledger?.income, []);
  const expenseRows = sanitizeImportedEntries(ledger?.expense, income.entries);
  const prefs = normalisePrefs(raw.prefs);
  const budgets = normaliseBudgets(raw.budgets);
  const recurring = normaliseRecurring(raw.recurring);

  let partyBook: PartyBook = { parties: [], txns: [] };
  if (raw.partyBook) {
    try {
      partyBook = partyBookFromJson(JSON.stringify(raw.partyBook));
    } catch {
      partyBook = { parties: [], txns: [] };
    }
  }

  const total = income.entries.length + expenseRows.entries.length;
  if (total === 0 && partyBook.parties.length === 0) {
    throw new Error("بیک اپ میں کوئی درست ریکارڈ نہیں ملا — فائل تبدیل ہو چکی ہے۔");
  }

  /* Everything is validated; only now is storage touched. */
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      income: income.entries,
      expense: expenseRows.entries,
      undoStack: [],
      restoredAt: now.getTime(),
    }),
  );
  localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
  localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets));
  localStorage.setItem(RECURRING_KEY, JSON.stringify(recurring));
  localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify(partyBook));

  return {
    income: income.entries.length,
    expense: expenseRows.entries.length,
    parties: partyBook.parties.length,
    partyTxns: partyBook.txns.length,
  };
}
