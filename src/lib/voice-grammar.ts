/**
 * Spoken-correction grammar.
 *
 * A shopkeeper who says the wrong amount does not want to open a form: they say
 * «نہیں، پچاس نہیں دو سو». The recogniser gives us one flat sentence, so the
 * correction is read structurally:
 *
 *   • a negation/repair marker (نہیں، غلط، درست، دوبارہ) is required;
 *   • the amount that follows the *last* marker wins, because that is the value
 *     the speaker ended on;
 *   • if no amount follows the marker, the first amount in the sentence is the
 *     only number the user said that we can trust.
 *
 * Everything else falls through to the normal parser, so this module can never
 * turn a plain "دو سو روپے چائے" into a correction.
 */
import { parseAmount } from "@/lib/khata";

const REPAIR_MARKER = /نہیں|نہی|غلط|درست کرو|دوبارہ/;

/**
 * Returns the corrected amount, or `null` when the sentence is not a correction
 * (or repeats the amount that is already pending).
 */
export function parseCorrection(text: string, currentAmount = 0): number | null {
  if (!text || !REPAIR_MARKER.test(text)) return null;

  const parts = text.split(/نہیں|نہی|غلط/);
  /* Only what follows the LAST marker counts. Joining every trailing segment
     would read «پچاس نہیں دو سو» as “پچاس دو سو” = 5200, because Urdu stacks
     numerals additively before a multiplier — a test caught exactly that. */
  const afterMarker = parts.length > 1 ? parts[parts.length - 1] : "";
  const corrected = parseAmount(afterMarker) ?? parseAmount(text);

  if (corrected === null || corrected <= 0) return null;
  if (currentAmount > 0 && corrected === currentAmount) return null;
  return corrected;
}

/** True when the sentence is only a refusal ("نہیں", "نہیں چاہیے"). */
export function isPureRefusal(text: string): boolean {
  if (!REPAIR_MARKER.test(text)) return false;
  return parseAmount(text) === null;
}
