/** Spoken corrections must never turn a normal sentence into a correction. */
import { describe, expect, it } from "vitest";
import { isPureRefusal, parseCorrection } from "@/lib/voice-grammar";

describe("parseCorrection", () => {
  it("takes the amount after the repair marker", () => {
    expect(parseCorrection("نہیں، پچاس نہیں دو سو", 50)).toBe(200);
  });

  it("reads a single corrected amount", () => {
    expect(parseCorrection("نہیں، دو سو", 50)).toBe(200);
  });

  it("accepts digits", () => {
    expect(parseCorrection("نہیں 750", 500)).toBe(750);
  });

  it("ignores sentences with no repair marker", () => {
    expect(parseCorrection("دو سو روپے چائے", 0)).toBeNull();
  });

  it("ignores a repeat of the pending amount", () => {
    expect(parseCorrection("نہیں دو سو", 200)).toBeNull();
  });

  it("ignores a refusal with no amount", () => {
    expect(parseCorrection("نہیں یہ غلط ہے", 100)).toBeNull();
  });
});

describe("isPureRefusal", () => {
  it("recognises a plain refusal", () => {
    expect(isPureRefusal("نہیں")).toBe(true);
    expect(isPureRefusal("نہیں چاہیے")).toBe(true);
  });

  it("does not treat a correction as a refusal", () => {
    expect(isPureRefusal("نہیں، دو سو")).toBe(false);
  });
});
