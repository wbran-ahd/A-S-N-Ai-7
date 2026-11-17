/**
 * `useAiAdvisor` — the analysis button.
 *
 * Behaviour, stated plainly so the UI can be honest about it:
 *
 *   • key saved on this device → a real Gemini request runs; the result is
 *     tagged `gemini`;
 *   • no key, or the request fails → a deterministic local summary is returned
 *     and tagged `local`, and a failure message is exposed so the panel can say
 *     why the real analysis did not run.
 *
 * The previous implementation slept for 800ms and returned a template while the
 * panel claimed an AI had analysed the books. That timer is gone.
 */
import { useState, type ReactNode } from "react";
import {
  buildLocalInsight,
  readDeviceAiKey,
  requestGeminiInsight,
  type AiAnalysisInput,
} from "@/lib/ai";
import type { AiInsight } from "@/lib/khata";
import { logError } from "@/lib/logger";

export type AiSource = "gemini" | "local";

interface UseAiAdvisorOptions {
  monthKey: string;
  monthName: string;
  totals: {
    carryForward: number;
    totalIncome: number;
    totalExpense: number;
    balance: number;
  };
  breakdown: { category: string; icon: string; amount: number; share: number }[];
  history: { monthKey: string; income: number; expense: number }[];
  announce?: (display: ReactNode, speechText?: string) => void;
  /** Injectable for tests; defaults to the device-stored key. */
  getApiKey?: () => string;
}

export function useAiAdvisor({
  monthKey,
  monthName,
  totals,
  breakdown,
  history,
  announce,
  getApiKey = readDeviceAiKey,
}: UseAiAdvisorOptions) {
  const [aiBusy, setAiBusy] = useState(false);
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [aiSource, setAiSource] = useState<AiSource | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  async function runAi(question?: string) {
    if (aiBusy) return;
    setAiBusy(true);
    setAiError(null);

    const input: AiAnalysisInput = {
      monthKey,
      monthName,
      totals,
      categories: breakdown.map((row) => ({
        category: row.category,
        amount: row.amount,
        share: row.share,
      })),
      history,
      question,
    };

    try {
      const apiKey = getApiKey().trim();

      if (apiKey) {
        try {
          const answer = await requestGeminiInsight(apiKey, input);
          setInsight(answer);
          setAiSource("gemini");
          announce?.(answer.insight, answer.spoken);
          return;
        } catch (error) {
          setAiError(
            error instanceof Error
              ? error.message
              : "اے آئی تجزیہ ناکام — مقامی تجزیہ دکھایا جا رہا ہے۔",
          );
          logError("ai", "gemini analysis failed", error);
        }
      }

      /* No key, or the call failed: show the labelled local analysis so the
         shopkeeper still gets an answer — never a fake "AI" one. */
      const local = buildLocalInsight(input);
      setInsight(local);
      setAiSource("local");
      announce?.(local.insight, local.spoken);
    } finally {
      setAiBusy(false);
    }
  }

  return {
    aiBusy,
    insight,
    aiSource,
    aiError,
    runAi,
  };
}
