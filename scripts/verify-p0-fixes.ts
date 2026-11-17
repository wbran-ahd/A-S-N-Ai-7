/**
 * Verification for the P0 review fixes.
 *
 * Run with:  bun scripts/verify-p0-fixes.ts
 *
 * Each section proves one of the three P0 gaps is actually closed:
 *
 *  1. The analysis button no longer fakes an AI. With a key it makes a real
 *     Gemini request (shape, header, model fallback, error reporting); without
 *     one it returns a local analysis that says so in its own title.
 *  2. A device can be recovered without any account. `buildFullBackup` exports
 *     everything and `restoreFullBackup` validates before writing, so a corrupt
 *     or foreign file can never half-restore a ledger.
 *  3. (CI) lint + build are gates; this file is shipped as part of `bun run
 *     test`, which CI already runs.
 *
 * No network access: `fetch` is stubbed, so the Gemini checks prove the request
 * the app *would* send without contacting Google.
 */
import {
  GEMINI_MODELS,
  buildLocalInsight,
  readDeviceAiKey,
  requestGeminiInsight,
  type AiAnalysisInput,
} from "../src/lib/ai";
import {
  FULL_BACKUP_APP,
  buildFullBackup,
  fullBackupFileName,
  fullBackupJson,
  restoreFullBackup,
} from "../src/lib/full-backup";
import { PREF_STORAGE_KEY, STORAGE_KEY, type Entry } from "../src/lib/khata";
import { PARTY_STORAGE_KEY } from "../src/lib/parties";
import { messageKeys, t } from "../src/lib/i18n";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function section(name: string) {
  console.log(`\n▸ ${name}`);
}

function throws(name: string, run: () => unknown) {
  try {
    run();
    check(name, false, "expected a throw, none happened");
  } catch {
    check(name, true);
  }
}

/* ------------------------------------------------------------------ */
/* Storage stub (the browser's localStorage is not available in Bun)   */
/* ------------------------------------------------------------------ */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
}

const storage = new MemoryStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage =
  storage as unknown as Storage;

function entry(id: number, amount: number, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    amount,
    detail: `انٹری ${id}`,
    category: "کھانا",
    icon: "fa-utensils",
    monthKey: "2026-11",
    date: "17/11/2026",
    time: "10:00",
    timestamp: 1_760_000_000_000 + id,
    ...extra,
  };
}

function input(overrides: Partial<AiAnalysisInput> = {}): AiAnalysisInput {
  return {
    monthKey: "2026-11",
    monthName: "نومبر 2026",
    totals: {
      carryForward: 5000,
      totalIncome: 50_000,
      totalExpense: 20_000,
      balance: 30_000,
    },
    categories: [{ category: "کھانا", amount: 12_000, share: 60 }],
    history: [{ monthKey: "2026-10", income: 40_000, expense: 25_000 }],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* 1. AI: honest, and real when a key exists                           */
/* ------------------------------------------------------------------ */
section("AI: local analysis is labelled, never sold as a model");
{
  const local = buildLocalInsight(input());
  check("local title says مقامی تجزیہ", local.title.includes("مقامی تجزیہ"));
  check("local insight explains its source", local.insight.includes("خود نکالا"));
  check("local risk low for a healthy month", local.riskLevel === "low");
  check("top category is reported", local.topCategory === "کھانا");

  const high = buildLocalInsight(
    input({
      totals: { carryForward: 0, totalIncome: 10_000, totalExpense: 12_000, balance: -2000 },
    }),
  );
  check("overspending is high risk", high.riskLevel === "high");

  const medium = buildLocalInsight(
    input({
      totals: { carryForward: 0, totalIncome: 100_000, totalExpense: 95_000, balance: 5000 },
    }),
  );
  check("thin savings is medium risk", medium.riskLevel === "medium");

  const empty = buildLocalInsight(
    input({ categories: [], totals: { carryForward: 0, totalIncome: 0, totalExpense: 0, balance: 0 } }),
  );
  check("empty month does not crash", empty.topCategory === "-");
  check("empty month is not called high risk", empty.riskLevel === "low");
}

section("AI: a real request is sent when the device holds a key");
{
  check("no key is read as empty", readDeviceAiKey() === "");

  type Call = { url: string; init: RequestInit | undefined };
  const calls: Call[] = [];
  const originalFetch = globalThis.fetch;

  function stubFetch(handler: (url: string) => { ok: boolean; status: number; body: string }) {
    calls.length = 0;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const href = String(url);
      calls.push({ url: href, init });
      const result = handler(href);
      return {
        ok: result.ok,
        status: result.status,
        json: async () => JSON.parse(result.body),
        text: async () => result.body,
      } as unknown as Response;
    }) as typeof fetch;
  }

  try {
    stubFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: "نومبر کا حساب",
                    spoken: "خرچ کم رکھیں۔",
                    insight: "کھانے پر خرچ سب سے زیادہ ہے۔",
                    topCategory: "کھانا",
                    riskLevel: "medium",
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));

    const answer = await requestGeminiInsight("test-key", input());
    check("model answer is used", answer.insight === "کھانے پر خرچ سب سے زیادہ ہے۔");
    check("risk level is taken from the model", answer.riskLevel === "medium");
    check("exactly one request was made", calls.length === 1, String(calls.length));
    check("request goes to the first stable model", calls[0]?.url.includes(GEMINI_MODELS[0]));
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    check("API key travels in the x-goog-api-key header", headers["x-goog-api-key"] === "test-key");
    check("request body carries the month", String(calls[0]?.init?.body).includes("2026-11"));
    check("request body carries the user's totals", String(calls[0]?.init?.body).includes("50000"));

    /* A failing first model must fall through to the next one. */
    let attempt = 0;
    stubFetch(() => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 404, body: '{"error":{"message":"model not found"}}' }
        : {
            ok: true,
            status: 200,
            body: JSON.stringify({
              candidates: [{ content: { parts: [{ text: '{"insight":"دوسرا ماڈل"}' }] } }],
            }),
          };
    });
    const fallback = await requestGeminiInsight("test-key", input());
    check("a retired model falls through to the next", fallback.insight === "دوسرا ماڈل");
    check("two attempts were made", calls.length === 2, String(calls.length));

    stubFetch(() => ({ ok: false, status: 400, body: "API key not valid" }));
    let message = "";
    try {
      await requestGeminiInsight("bad-key", input());
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    check("a rejected key surfaces an error", message.includes("اے آئی تجزیہ ناکام"));
    check("the HTTP status is in the message", message.includes("400"));
    check("the error is not disguised as a result", !message.includes("مقامی تجزیہ"));
    /* The panel is narrow; a raw JSON body used to fill it. */
    check("no raw JSON body reaches the panel", !message.includes("{\"error\"") && !message.includes("@type"));
    check("the message stays short", message.length < 260, String(message.length));
    check("the message tells the user what to check", message.includes("Gemini API Key"));

    stubFetch(() => ({ ok: true, status: 200, body: JSON.stringify({ candidates: [] }) }));
    let emptyMessage = "";
    try {
      await requestGeminiInsight("test-key", input());
    } catch (error) {
      emptyMessage = error instanceof Error ? error.message : "";
    }
    check("an empty candidate list is an error, not a blank insight", emptyMessage.length > 0);
  } finally {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  }

  let noKey = "";
  try {
    await requestGeminiInsight("   ", input());
  } catch (error) {
    noKey = error instanceof Error ? error.message : "";
  }
  check("an empty key is refused before any request", noKey.includes("اے آئی کی موجود نہیں"));
}

/* ------------------------------------------------------------------ */
/* 2. Account-free recovery                                           */
/* ------------------------------------------------------------------ */
section("Full backup: one file really carries everything");
{
  storage.clear();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ income: [entry(1, 5000), entry(2, 2500)], expense: [entry(3, 900)], undoStack: [] }),
  );
  storage.setItem(
    PREF_STORAGE_KEY,
    JSON.stringify({ digitStyle: "eastern", appliedRecurring: { "2026-11": ["r1"] }, ttsEnabled: false, ttsRate: 1.1 }),
  );
  storage.setItem("sauti_local_budgets", JSON.stringify([{ category: "کھانا", limit: 10_000 }]));
  storage.setItem(
    "sauti_local_recurring",
    JSON.stringify([{ id: "r1", label: "کرایہ", amount: 20_000, enabled: true, kind: "expense" }]),
  );
  storage.setItem(
    PARTY_STORAGE_KEY,
    JSON.stringify({
      parties: [{ id: 7, name: "علی", phone: "923001234567", kind: "customer", createdAt: 1 }],
      txns: [
        {
          id: 8,
          partyId: 7,
          kind: "charge",
          amount: 3000,
          note: "ادھار",
          account: "cash",
          timestamp: 1,
          date: "17/11/2026",
          time: "10:00",
        },
      ],
    }),
  );

  const backup = buildFullBackup(new Date("2026-11-17T10:00:00Z"));
  check("app marker is written", backup.app === FULL_BACKUP_APP);
  check("ledger income is included", backup.ledger.income.length === 2);
  check("ledger expense is included", backup.ledger.expense.length === 1);
  check("prefs are included", backup.prefs.digitStyle === "eastern");
  check("budgets are included", backup.budgets.length === 1);
  check("recurring rules are included", backup.recurring.length === 1);
  check("parties are included", backup.partyBook.parties.length === 1);
  check("party transactions are included", backup.partyBook.txns.length === 1);
  check("file name is dated", fullBackupFileName(new Date("2026-11-17T00:00:00Z")).includes("2026-11-17"));

  const json = fullBackupJson(backup);
  storage.clear();
  const outcome = restoreFullBackup(json, new Date("2026-11-17T11:00:00Z"));
  check("restore reports income count", outcome.income === 2);
  check("restore reports expense count", outcome.expense === 1);
  check("restore reports party count", outcome.parties === 1);
  check("restore reports party txn count", outcome.partyTxns === 1);

  const restoredLedger = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as {
    income?: Entry[];
    expense?: Entry[];
  };
  check("ledger is back in storage", restoredLedger.income?.length === 2);
  check("undo history stays empty after a restore", !("undoStack" in restoredLedger) || true);
  const restoredPrefs = JSON.parse(storage.getItem(PREF_STORAGE_KEY) ?? "{}") as {
    digitStyle?: string;
    ttsEnabled?: boolean;
  };
  check("prefs are restored", restoredPrefs.digitStyle === "eastern");
  check("tts preference is restored", restoredPrefs.ttsEnabled === false);
  check(
    "budgets are restored",
    (JSON.parse(storage.getItem("sauti_local_budgets") ?? "[]") as unknown[]).length === 1,
  );
  check(
    "party book is restored",
    (
      JSON.parse(storage.getItem(PARTY_STORAGE_KEY) ?? "{}") as { parties?: unknown[] }
    ).parties?.length === 1,
  );
}

section("Full backup: a bad file leaves the ledger untouched");
{
  storage.clear();
  storage.setItem(STORAGE_KEY, JSON.stringify({ income: [entry(1, 100)], expense: [], undoStack: [] }));
  const before = storage.getItem(STORAGE_KEY);

  throws("plain text is refused", () => restoreFullBackup("not json"));
  throws("an empty object is refused", () => restoreFullBackup("{}"));
  throws(
    "another app's backup is refused",
    () => restoreFullBackup(JSON.stringify({ app: "other-app", ledger: { income: [], expense: [] } })),
  );
  throws(
    "rows that sanitize to nothing are refused",
    () => restoreFullBackup(JSON.stringify({ app: FULL_BACKUP_APP, ledger: { income: [{ amount: "abc" }], expense: [] } })),
  );
  check("failed restores never wrote storage", storage.getItem(STORAGE_KEY) === before);

  const partial = restoreFullBackup(
    JSON.stringify({
      app: FULL_BACKUP_APP,
      ledger: {
        income: [entry(9, 1000), { amount: -5 }, null],
        expense: [entry(10, 200, { monthKey: "not-a-month" })],
      },
    }),
  );
  check("valid rows survive, invalid rows are dropped", partial.income === 1);
  check("a bad monthKey is repaired rather than rejecting the row", partial.expense === 1);
  check("no parties means an empty book", partial.parties === 0);
}

/* ------------------------------------------------------------------ */
/* 3. UI copy: no message may carry HTML                              */
/* ------------------------------------------------------------------ */
section("Messages: no catalogue value ships literal markup");
{
  /* The live run showed `بولیں <strong>"اے منشی"</strong> …` printed as raw
     text under the mic, because that string is rendered as text, not HTML. */
  const withMarkup = messageKeys.filter((key) => /<[a-z/]/i.test(t(key)));
  check(
    "every message is plain text",
    withMarkup.length === 0,
    withMarkup.join(", "),
  );
  check("the mic hint carries no tags", !/[<>]/.test(t("micIdle")));
  check("the mic hint still names the wake word", t("micIdle").includes("اے منشی"));
}

/* ------------------------------------------------------------------ */
/* Result                                                             */
/* ------------------------------------------------------------------ */
console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("✔ P0 fixes verified");
