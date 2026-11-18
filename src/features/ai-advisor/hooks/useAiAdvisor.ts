import { useState, type ReactNode } from "react";
import { type AiInsight } from "@/lib/khata";
import { analyzeWithServer } from "@/lib/ai";
import { logError } from "@/lib/logger";
import { track } from "@/lib/telemetry";

interface UseAiAdvisorOptions {
  monthName: string;
  /** `YYYY-MM` of the month being viewed — the server needs the real bucket. */
  monthKey?: string;
  totals: {
    totalIncome: number;
    totalExpense: number;
    balance: number;
    carryForward: number;
  };
  breakdown: { category: string; icon: string; amount: number; share: number }[];
  history?: { monthKey: string; income: number; expense: number }[];
  announce?: (display: ReactNode, speechText?: string) => void;
}

/**
 * Local, offline answer. It is *labelled* as local so a shopkeeper never
 * mistakes arithmetic for advice: the server function is tried first, and this
 * only runs when it cannot answer (not deployed, offline, quota exhausted).
 */
function localInsight(
  monthName: string,
  totals: UseAiAdvisorOptions["totals"],
  breakdown: UseAiAdvisorOptions["breakdown"],
): AiInsight {
  const savingsRate =
    totals.totalIncome > 0
      ? ((totals.totalIncome - totals.totalExpense) / totals.totalIncome) * 100
      : 0;
  const topCat = breakdown[0]?.category || "متفرق";
  const riskLevel: "low" | "medium" | "high" =
    totals.totalExpense > totals.totalIncome ? "high" : savingsRate < 10 ? "medium" : "low";

  const summaryText = `آپ کے مالی جائزے کے مطابق (${monthName}): کل آمدنی ${totals.totalIncome} روپے اور کل اخراجات ${totals.totalExpense} روپے ہیں۔ سب سے بڑا خرچہ ${topCat} پر ہوا ہے۔`;

  return {
    title: `مالیاتی تجزیہ — ${monthName}`,
    spoken: summaryText,
    insight: summaryText,
    topCategory: topCat,
    riskLevel,
  };
}

export function useAiAdvisor({
  monthName,
  monthKey,
  totals,
  breakdown,
  history = [],
  announce,
}: UseAiAdvisorOptions) {
  const [aiBusy, setAiBusy] = useState(false);
  const [insight, setInsight] = useState<AiInsight | null>(null);

  const runAi = async (question?: string) => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      /* The project key lives on the server, so the default path needs no user
         key at all (task 11). `analyzeWithServer` returns `unavailable` when
         the function is not deployed, and we then compute locally. */
      const server = await analyzeWithServer({
        monthKey: monthKey ?? new Date().toISOString().slice(0, 7),
        totals,
        categories: breakdown.map((item) => ({
          category: item.category,
          amount: item.amount,
          share: item.share,
        })),
        history,
        ...(question ? { question } : {}),
      });

      if (server.status === "ok") {
        setInsight(server.insight);
        announce?.(server.insight.insight, server.insight.spoken);
        track("ai_analyze", { source: "server" });
        return;
      }

      if (server.status === "quota") {
        const message = server.message;
        setInsight({
          title: "اے آئی کی حد ختم",
          spoken: message,
          insight: message,
          topCategory: "-",
          riskLevel: "unavailable",
        });
        announce?.(message, message);
        track("ai_analyze", { source: "quota" });
        return;
      }

      const local = localInsight(monthName, totals, breakdown);
      setInsight(local);
      announce?.(local.insight, local.spoken);
      track("ai_analyze", { source: "local" });
    } catch (err) {
      logError("ai", "AI Advisor error", err);
    } finally {
      setAiBusy(false);
    }
  };

  return {
    aiBusy,
    insight,
    runAi,
  };
}
