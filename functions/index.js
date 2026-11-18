/**
 * صوتی بقیہ — the only server-side AI path.
 *
 * Firebase is the single backend: there is no Convex deployment any more. This
 * Cloud Function keeps the AI provider key off the device and enforces a
 * per-user daily quota, because a key shipped to the browser is a key someone
 * else will spend.
 *
 * Contract with the client (`src/lib/ai.ts`):
 *   call "analyze" with { monthKey, totals, categories, history, question? }
 *   → { title, spoken, insight, topCategory, riskLevel }
 *
 * Failure policy (deliberate): a missing key returns `unavailable`, never a
 * green "everything is fine" analysis. The client then falls back to its local
 * summary and says so.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/** Gemini calls allowed per user per UTC day — mirrors src/lib/ai-limit.ts. */
const AI_DAILY_LIMIT = 25;
/** Cached insights stay fresh for this long. */
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
];
const ZAI_MODELS = ["glm-5.3", "glm-5.2", "glm-5.1", "glm-5", "glm-4.7", "glm-4.6"];
const ZAI_DEFAULT_BASE = "https://api.z.ai/api/paas/v4";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function zaiBaseUrl() {
  return (process.env.ZAI_API_BASE || ZAI_DEFAULT_BASE).trim().replace(/\/+$/, "");
}

function buildPrompt(input) {
  const lines = [
    "آپ 'صوتی بقیہ' نامی اردو ذاتی مالی منشی ہیں۔",
    "نیچے دیے گئے حساب کے مطابق مختصر، عملی اردو مشورہ دیں۔",
    "جملے چھوٹے رکھیں، کوئی Markdown یا انگلش متن استعمال نہ کریں۔",
    "",
    `مہینہ: ${input.monthKey}`,
    `کل آمدنی: ${input.totals.totalIncome}`,
    `کل خرچہ: ${input.totals.totalExpense}`,
    `موجودہ بقایا: ${input.totals.balance}`,
    `پچھلا منتقل بقایا: ${input.totals.carryForward}`,
    "",
    "خرچے کی categories:",
    ...(input.categories.length > 0
      ? input.categories.map((c) => ` - ${c.category}: ${c.amount} (فیصد ${c.share}%)`)
      : [" - کوئی خرچہ درج نہیں"]),
    "",
    "پچھلے کچھ ماہ کا ہِساب:",
    ...(input.history.length > 0
      ? input.history.map((h) => ` - ${h.monthKey}: آمدنی ${h.income}, خرچہ ${h.expense}`)
      : [" - تاریخی ڈیٹا دستیاب نہیں"]),
    "",
    "fields:",
    ' - title: ایک خطاب، 5 الفاظ سے کم (مثلاً "اکتوبر کا ہِساب")',
    " - spoken: 2 جملوں سے کم، اردو، TTS کے لیے پڑھنے کے قابل",
    " - insight: 2 تا 4 جملے، بنیادی مشورہ اور رجحان",
    " - topCategory: سب سے بڑی خرچ category یا '-'",
    ' - riskLevel: "low" یا "medium" یا "high" (آمدنی سے زیادہ خرچ ہو تو high)',
  ];
  if (input.question) {
    lines.push("", `صارف کا سوال: "${input.question}" — اسی کا جواب دیں۔`);
  }
  return lines.join("\n");
}

function fallbackInsight() {
  return {
    title: "اے آئی دستیاب نہیں",
    spoken: "اے آئی تجزیہ ابھی دستیاب نہیں۔ براہِ مہربانی بعد میں دوبارہ کوشش کریں۔",
    insight:
      "سرور پر AI کی چابی سیٹ نہیں ہے۔ Firebase Functions کے environment میں ZAI_API_KEY یا GEMINI_API_KEY شامل کریں۔",
    topCategory: "-",
    riskLevel: "unavailable",
  };
}

function normaliseInsight(raw) {
  const risk = String(raw.riskLevel || "low").toLowerCase();
  return {
    title: String(raw.title || "ای آئی جائزہ"),
    spoken: String(raw.spoken || ""),
    insight: String(raw.insight || ""),
    topCategory: String(raw.topCategory || "-"),
    riskLevel: ["low", "medium", "high", "unavailable"].includes(risk) ? risk : "low",
  };
}

async function callZai(apiKey, prompt) {
  const url = `${zaiBaseUrl()}/chat/completions`;
  const userPrompt = `${prompt}\n\nJSON object کے طور پر جواب دیں (JSON only).`;
  for (const model of ZAI_MODELS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: userPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        console.warn(`[ai] z.ai ${model} failed: ${response.status}`);
        continue;
      }
      const payload = await response.json();
      const text = String(payload?.choices?.[0]?.message?.content || "").trim();
      if (!text) continue;
      try {
        return normaliseInsight(JSON.parse(text));
      } catch {
        return { title: "ای آئی جائزہ", spoken: text.slice(0, 180), insight: text, topCategory: "-", riskLevel: "low" };
      }
    } catch {
      // network / timeout — try the next model
    }
  }
  return null;
}

async function callGemini(apiKey, prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 600 },
  });
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(45_000),
        },
      );
      if (!response.ok) {
        console.warn(`[ai] ${model} failed: ${response.status}`);
        continue;
      }
      const payload = await response.json();
      const text = String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (!text) continue;
      try {
        return normaliseInsight(JSON.parse(text));
      } catch {
        return { title: "ای آئی جائزہ", spoken: text.slice(0, 180), insight: text, topCategory: "-", riskLevel: "low" };
      }
    } catch {
      // network / timeout — try the next model
    }
  }
  return null;
}

function settingsRef(uid) {
  return db.collection("users").doc(uid).collection("settings").doc("current");
}

/** Reads the quota without spending it; only a real answer costs a call. */
async function readQuota(uid) {
  const doc = await settingsRef(uid).get();
  const data = doc.exists ? doc.data() : {};
  const used = data.aiDay === today() ? Number(data.aiCalls || 0) : 0;
  return { used, remaining: Math.max(0, AI_DAILY_LIMIT - used) };
}

async function spendQuota(uid) {
  const ref = settingsRef(uid);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.exists ? doc.data() : {};
    const used = data.aiDay === today() ? Number(data.aiCalls || 0) + 1 : 1;
    tx.set(ref, { aiDay: today(), aiCalls: used }, { merge: true });
  });
}

function cacheRef(uid, key) {
  return db.collection("users").doc(uid).collection("aiCache").doc(key);
}

exports.analyze = onCall({ region: "us-central1", cors: true, timeoutSeconds: 90 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "شناخت درکار ہے۔");

  const input = request.data?.input;
  if (!input || typeof input.monthKey !== "string" || !input.totals) {
    throw new HttpsError("invalid-argument", "درخواست نامکمل ہے۔");
  }

  const key = `${input.monthKey}-${Buffer.from(JSON.stringify(input)).toString("base64").slice(0, 180)}`;
  const cached = await cacheRef(uid, key).get();
  if (cached.exists) {
    const data = cached.data();
    if (data.expiresAt > Date.now() && data.insight) return data.insight;
  }

  const zaiKey = process.env.ZAI_API_KEY || "";
  const geminiKey = process.env.GEMINI_API_KEY || "";
  if (!zaiKey && !geminiKey) return fallbackInsight();

  const quota = await readQuota(uid);
  if (quota.remaining === 0) {
    throw new HttpsError("resource-exhausted", "آج کی اے آئی کی حد ختم ہو چکی ہے — کل دوبارہ کوشش کریں۔");
  }

  const prompt = buildPrompt(input);
  let result = zaiKey ? await callZai(zaiKey, prompt) : null;
  if (!result && geminiKey) result = await callGemini(geminiKey, prompt);
  if (!result) throw new HttpsError("internal", "AI جائزہ ناکام: کوئی مدل جواب نہیں دے سکا۔");

  await spendQuota(uid);
  await cacheRef(uid, key).set({
    insight: result,
    userId: uid,
    createdAt: Date.now(),
    expiresAt: Date.now() + AI_CACHE_TTL_MS,
  });

  return result;
});
