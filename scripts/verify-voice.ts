/**
 * Voice grammar checks — spoken corrections and refusal detection.
 *
 * Run with:  bun scripts/verify-voice.ts   (part of `bun run test`)
 *
 * These use the real exported functions; nothing here mocks the parser, so a
 * regression in `parseAmount` or the correction rules fails the suite.
 */
import { parseAmount } from "../src/lib/khata";
import { isPureRefusal, parseCorrection } from "../src/lib/voice-grammar";

let passed = 0;
const failures: string[] = [];

function equal(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    return;
  }
  failures.push(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

/* The old amount is stated first, the corrected one last. */
equal("correction: «نہیں، پچاس نہیں دو سو» keeps the last amount", parseCorrection("نہیں، پچاس نہیں دو سو", 50), 200);
equal("correction: plain «نہیں، دو سو» reads the only amount", parseCorrection("نہیں، دو سو", 50), 200);
equal("correction: digits work too", parseCorrection("نہیں 750", 500), 750);
equal("correction: no marker means no correction", parseCorrection("دو سو روپے چائے", 0), null);
equal("correction: repeating the pending amount is ignored", parseCorrection("نہیں دو سو", 200), null);
equal("correction: unparseable sentence is ignored", parseCorrection("نہیں یہ غلط ہے", 100), null);

/* Refusals must never be mistaken for a corrected amount. */
equal("refusal: bare نہیں", isPureRefusal("نہیں"), true);
equal("refusal: نہیں چاہیے", isPureRefusal("نہیں چاہیے"), true);
equal("refusal: a corrected amount is not a refusal", isPureRefusal("نہیں، دو سو"), false);

/* The normal parser still wins for ordinary sentences. */
equal("parse: ordinary Urdu sentence", parseAmount("دو سو روپے چائے"), 200);
equal("parse: Roman Urdu", parseAmount("paanch sau petrol"), 500);

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error("\nFailed:");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("✔ voice grammar verified");
