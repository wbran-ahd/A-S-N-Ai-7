/**
 * AI analysis client — the only path that talks to the server for AI.
 *
 * The provider key never reaches the browser: the Firebase Cloud Function
 * (`functions/index.js`) holds it, enforces the daily quota and caches the
 * answer. Everything here is dynamically imported, so `firebase/functions` only
 * downloads when the shopkeeper actually asks for advice.
 *
 * Failure is explicit, never disguised: if the function is not deployed (or the
 * project has no key), the caller falls back to its *local* summary and labels
 * it as such instead of pretending an AI answered.
 */
import type { AiInsight } from "@/lib/khata";
import { logEvent } from "@/lib/logger";

export type ServerAiInput = {
  monthKey: string;
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

export type ServerAiResult =
  | { status: "ok"; insight: AiInsight }
  | { status: "quota"; message: string }
  | { status: "unavailable"; reason: string };

/** Maps a callable error code to the small set of states the UI understands. */
function classify(error: unknown): ServerAiResult {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = (error as { message?: string } | null)?.message ?? "";
  if (code === "functions/resource-exhausted") {
    return { status: "quota", message: message || "آج کی اے آئی کی حد ختم ہو چکی ہے۔" };
  }
  /* `not-found` / `unimplemented` = the function is not deployed for this
     project; `unauthenticated` = no anonymous session yet. Both mean "use the
     local summary", not "the app is broken". */
  return { status: "unavailable", reason: code || message || "unknown" };
}

export async function analyzeWithServer(
  input: ServerAiInput,
): Promise<ServerAiResult> {
  try {
    const [functionsModule, firebase] = await Promise.all([
      import("firebase/functions"),
      import("@/lib/firebase"),
    ]);
    const callable = functionsModule.httpsCallable<{ input: ServerAiInput }, AiInsight>(
      functionsModule.getFunctions(firebase.app, "us-central1"),
      "analyze",
    );
    const response = await callable({ input });
    return { status: "ok", insight: response.data };
  } catch (error) {
    const result = classify(error);
    logEvent("ai", result.status === "quota" ? "warn" : "info", "server ai unavailable", {
      status: result.status,
      reason: result.status === "unavailable" ? result.reason : undefined,
    });
    return result;
  }
}
