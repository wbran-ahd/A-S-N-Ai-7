/**
 * The upload planner and the download merge decide whether money survives a
 * second device. These tests pin the guarantees the UI status text promises:
 * retries are idempotent, a stale device never rolls back, and a tombstone is
 * never resurrected.
 */
import { describe, expect, it } from "vitest";
import {
  mergeCloudRows,
  planUpload,
  recordFromEntry,
  validateCloudRows,
  type CloudRow,
} from "@/hooks/use-merge-logic";
import type { Entry } from "@/lib/khata";

const T0 = 1_700_000_000_000;

function local(id: number, amount: number, updatedAt = T0): Entry {
  return {
    id,
    amount,
    detail: `row-${id}`,
    category: "عام",
    icon: "fa-tag",
    monthKey: "2026-11",
    date: "",
    time: "",
    timestamp: T0,
    updatedAt,
    account: "cash",
  };
}

function cloud(id: number, amount: number, extra: Partial<CloudRow> = {}): CloudRow {
  return { ...recordFromEntry(local(id, amount), "expense"), ...extra };
}

describe("planUpload", () => {
  it("is idempotent: an identical cloud copy is not rewritten", () => {
    const plan = planUpload([cloud(1, 100)], [cloud(1, 100)]);
    expect(plan.writes).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("writes a row the cloud has never seen", () => {
    const plan = planUpload([cloud(2, 50)], []);
    expect(plan.writes.map((row) => row.localId)).toEqual([2]);
  });

  it("never overwrites a newer cloud copy", () => {
    const plan = planUpload([cloud(1, 100, { updatedAt: T0 })], [cloud(1, 100, { updatedAt: T0 + 5_000, amount: 999 })]);
    expect(plan.writes).toHaveLength(0);
    expect(plan.cloudNewer).toBe(1);
  });

  it("never writes over a tombstone (deletion wins)", () => {
    const plan = planUpload(
      [cloud(1, 100)],
      [cloud(1, 100, { deleted: true, deletedAt: T0 + 1, deletedEventId: "e1" })],
    );
    expect(plan.writes).toHaveLength(0);
    expect(plan.tombstoned).toBe(1);
  });

  it("counts cloud-only rows instead of deleting them", () => {
    const plan = planUpload([], [cloud(7, 10)]);
    expect(plan.cloudOnly).toBe(1);
    expect(plan.writes).toHaveLength(0);
  });
});

describe("mergeCloudRows", () => {
  it("appends a cloud-only record once, even if the payload repeats it", () => {
    const row = validateCloudRows([cloud(5, 300)])[0];
    if (!row.ok) throw new Error("fixture should be valid");
    const merged = mergeCloudRows([], [], [row.row, row.row]);
    expect(merged.expense).toHaveLength(1);
    expect(merged.added).toBe(1);
  });

  it("removes a local record whose cloud copy is a tombstone", () => {
    const rows = validateCloudRows([
      cloud(1, 100, { deleted: true, deletedAt: T0 + 2, deletedEventId: "e1" }),
    ]);
    const validated = rows.filter((outcome) => outcome.ok).map((outcome) => (outcome as { row: never }).row);
    const merged = mergeCloudRows([], [local(1, 100)], validated as never);
    expect(merged.expense).toHaveLength(0);
    expect(merged.tombstoned).toBe(1);
    expect(merged.tombstoneIds).toEqual([1]);
  });

  it("does not resurrect a record this device deleted", () => {
    const outcome = validateCloudRows([cloud(2, 500)])[0];
    if (!outcome.ok) throw new Error("fixture should be valid");
    const merged = mergeCloudRows([], [], [outcome.row], [2]);
    expect(merged.expense).toHaveLength(0);
    expect(merged.skippedDeleted).toBe(1);
  });

  it("keeps the newer local edit when the cloud copy is older", () => {
    const outcome = validateCloudRows([cloud(3, 100, { updatedAt: T0 })])[0];
    if (!outcome.ok) throw new Error("fixture should be valid");
    const merged = mergeCloudRows([], [local(3, 100, T0 + 10_000)], [outcome.row]);
    expect(merged.expense).toHaveLength(1);
    expect(merged.conflicts).toBe(0);
  });

  it("rejects malformed cloud rows instead of guessing", () => {
    const bad = validateCloudRows([{ ...cloud(1, 10), monthKey: "2026" }]);
    expect(bad[0]).toMatchObject({ ok: false });
  });
});
