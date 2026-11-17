/**
 * AI analysis for صوتی بقیہ.
 *
 * Two honest paths, never a fake one:
 *
 *   1. `requestGeminiInsight` — a real HTTPS call to Google's Gemini API using
 *      the key the shopkeeper saved **on this device** (`sauti_gemini_key`).
 *      The key never leaves the browser except to Google, and it is never
 *      written to Firestore.
 *   2. `buildLocalInsight` — a deterministic, offline summary of the same
 *      numbers, used when no key is saved or the API call fails. It is labelled
 *      "مقامی تجزیہ" in the UI, so it can never be mistaken for a model answer.
 *
 * Previously the button showed a canned string after an 800ms timer while the
 * UI claimed an AI had run. Nothing here waits for a timer or invents a result.
 */
import type { AiInsight } from "./khata";

/** Device-local key slot. Kept in sync with `use-sync` (`DEVICE_KEY_STORAGE`). */
export const DEVICE_AI_KEY_STORAGE = "sauti_gemini_key";

/** Stable models, newest first. A retired model simply falls through to the next. */
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 25_000;

export type AiAnalysisInput = {
  monthKey: string;
  monthName: string;
  totals: {
    carryForward: number;
    totalIncome: number;
    totalExpense: number;
    balance: number;
  };
  categories: { category: string; amount: number; share: number }[];
  history: { monthKey: string; income: number; expense: number }[];
  question?: string;
};

/** The key saved on this device, or `""` when none is configured. */
export function readDeviceAiKey(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "";
  try {
    return (localStorage.getItem(DEVICE_AI_KEY_STORAGE) ?? "").trim();
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Local, deterministic analysis (never claims to be a model)          */
/* ------------------------------------------------------------------ */

function savingsRate(input: AiAnalysisInput): number {
  if (input.totals.totalIncome <= 0) return 0;
  return ((input.totals.totalIncome - input.totals.totalExpense) / input.totals.totalIncome) * 100;
}

export function localRiskLevel(input: AiAnalysisInput): AiInsight["riskLevel"] {
  /* A month with no records is not a risk signal: calling it "medium" would
     tell a shopkeeper something is wrong when nothing has been entered yet. */
  if (input.totals.totalIncome <= 0 && input.totals.totalExpense <= 0) return "low";
  if (input.totals.totalExpense > input.totals.totalIncome) return "high";
  return savingsRate(input) < 10 ? "medium" : "low";
}

/**
 * An accurate summary derived only from the ledger.
 *
 * Deliberately plain: it reports the numbers and one rule-based suggestion, and
 * its title says it is a local analysis.
 */
export function buildLocalInsight(input: AiAnalysisInput): AiInsight {
  const rate = savingsRate(input);
  const top = input.categories[0];
  const risk = localRiskLevel(input);
  const advice =
    risk === "high"
      ? "خرچہ آمدنی سے بڑھ رہا ہے۔ سب سے بڑی قسم پر فوری کمی کا منصوبہ بنائیں۔"
      : risk === "medium"
        ? "بچت کم ہے۔ ماہانہ خرچ کا ایک حصہ مقرر کریں اور اس سے تجاوز نہ کریں۔"
        : "بچت ٹھیک ہے۔ یہی رفتار جاری رکھیں اور بچت کو الگ کھاتے میں رکھیں۔";

  return {
    title: `مقامی تجزیہ — ${input.monthName}`,
    spoken: `${input.monthName}: خرچہ ${input.totals.totalExpense} روپے، آمدنی ${input.totals.totalIncome} روپے۔`,
    insight: `${advice}${
      top ? ` سب سے زیادہ خرچ ${top.category} پر (${top.amount} روپے، ${top.share}%) ہوا۔` : ""
    } بچت کی شرح ${Math.round(rate)}% ہے۔ یہ تجزیہ آپ کے کھاتے کے اعداد سے خود نکالا گیا ہے۔`,
    topCategory: top?.category ?? "-",
    riskLevel: risk,
  };
}

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */

function buildPrompt(input: AiAnalysisInput): string {
  const lines = [
    "آپ 'صوتی بقیہ' نامی اردو ذاتی مالی منشی ہیں۔",
    "نیچے دیے گئے حساب کے مطابق مختصر اور عملی اردو مشورہ دیں۔",
    "جملے چھوٹے رکھیں، کوئی Markdown یا انگریزی متن استعمال نہ کریں۔",
    "",
    `مہینہ: ${input.monthKey}`,
    `کل آمدنی (پچھلا بقایا سمیت): ${input.totals.totalIncome}`,
    `کل خرچہ: ${input.totals.totalExpense}`,
    `موجودہ بقایا: ${input.totals.balance}`,
    `پچھلا منتقل بقایا: ${input.totals.carryForward}`,
    "",
    "خرچے کی اقسام:",
    ...(input.categories.length > 0
      ? input.categories.map((c) => ` - ${c.category}: ${c.amount} (${c.share}%)`)
      : [" - کوئی خرچہ درج نہیں"]),
    "",
    "پچھلے مہینوں کا حساب:",
    ...(input.history.length > 0
      ? input.history.map((h) => ` - ${h.monthKey}: آمدنی ${h.income}, خرچہ ${h.expense}`)
      : [" - تاریخی ڈیٹا دستیاب نہیں"]),
    "",
    "جواب صرف اس JSON شکل میں دیں:",
    '{"title":"...","spoken":"...","insight":"...","topCategory":"...","riskLevel":"low|medium|high"}',
  ];
  if (input.question) {
    lines.push("", `صارف کا سوال: "${input.question}" — اسی کا جواب دیں۔`);
  }
  return lines.join("\n");
}

type GeminiPayload = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

function extractText(payload: GeminiPayload): string {
  return payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

function normalise(raw: Record<string, unknown>, fallback: AiInsight): AiInsight {
  const risk = String(raw.riskLevel ?? fallback.riskLevel).toLowerCase();
  const riskLevel: AiInsight["riskLevel"] =
    risk === "low" || risk === "medium" || risk === "high" ? risk : fallback.riskLevel;
  return {
    title: String(raw.title ?? fallback.title),
    spoken: String(raw.spoken ?? fallback.spoken),
    insight: String(raw.insight ?? fallback.insight),
    topCategory: String(raw.topCategory ?? fallback.topCategory),
    riskLevel,
  };
}

async function requestModel(
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
): Promise<AiInsight | null> {
  const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Gemini ${model} — ${response.status}${text ? `: ${text}` : ""}`);
  }

  const payload = (await response.json()) as GeminiPayload;
  const text = extractText(payload);
  if (!text) return null;

  try {
    return normalise(JSON.parse(text) as Record<string, unknown>, {
      title: "اے آئی جائزہ",
      spoken: text.slice(0, 180),
      insight: text,
      topCategory: "-",
      riskLevel: "low",
    });
  } catch {
    /* A model that answered in prose is still a real answer. */
    return {
      title: "اے آئی جائزہ",
      spoken: text.slice(0, 180),
      insight: text,
      topCategory: "-",
      riskLevel: "low",
    };
  }
}

/**
 * Calls Gemini with the user's own key.
 *
 * Throws when every model fails, so the caller can say plainly what happened
 * instead of presenting a template as an AI answer.
 */
export async function requestGeminiInsight(
  apiKey: string,
  input: AiAnalysisInput,
): Promise<AiInsight> {
  const key = apiKey.trim();
  if (!key) throw new Error("اے آئی کی موجود نہیں — سیٹنگز میں اپنی Gemini API Key درج کریں۔");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const prompt = buildPrompt(input);
  let lastError: unknown = null;

  try {
    for (const model of GEMINI_MODELS) {
      try {
        const insight = await requestModel(key, model, prompt, controller.signal);
        if (insight) return insight;
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (controller.signal.aborted) throw new Error("اے آئی کا جواب وقت پر نہیں آیا — دوبارہ کوشش کریں۔");
  const detail = lastError instanceof Error ? lastError.message : "نامعلوم خرابی";
  throw new Error(`اے آئی تجزیہ ناکام: ${detail}`);
}
