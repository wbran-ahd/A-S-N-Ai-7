/**
 * `khataReducer` is the single place every record change goes through, so these
 * are the tests that protect the money: add, edit, delete, undo and merge.
 */
import { describe, expect, it } from "vitest";
import { UNDO_STACK_LIMIT, khataReducer, makeRecord, type KhataCommand } from "@/hooks/use-khata";
import type { DataState, Entry } from "@/lib/khata";

function entry(id: number, amount = 100): Entry {
  return {
    id,
    amount,
    detail: `test-${id}`,
    category: "عام",
    icon: "fa-tag",
    monthKey: "2026-11",
    date: "",
    time: "",
    timestamp: 1_700_000_000_000 + id,
    updatedAt: 1_700_000_000_000 + id,
    account: "cash",
  };
}

function state(income: Entry[] = [], expense: Entry[] = []): DataState {
  return { income, expense, undoStack: [] };
}

function apply(snapshot: DataState, ...commands: KhataCommand[]): DataState {
  return commands.reduce(khataReducer, snapshot);
}

describe("khataReducer", () => {
  it("adds a record and remembers it for undo", () => {
    const next = apply(state(), { kind: "add", entryType: "expense", entry: entry(1) });
    expect(next.expense).toHaveLength(1);
    expect(next.undoStack).toHaveLength(1);
    expect(next.income).toHaveLength(0);
  });

  it("undo removes exactly the last added record", () => {
    const next = apply(
      state(),
      { kind: "add", entryType: "expense", entry: entry(1) },
      { kind: "add", entryType: "expense", entry: entry(2) },
      { kind: "undo" },
    );
    expect(next.expense.map((row) => row.id)).toEqual([1]);
    expect(next.undoStack).toHaveLength(1);
  });

  it("undo on an empty stack is a no-op", () => {
    const before = state([entry(1)], []);
    expect(khataReducer(before, { kind: "undo" })).toBe(before);
  });

  it(`caps the undo stack at ${UNDO_STACK_LIMIT} entries`, () => {
    let snapshot = state();
    for (let id = 1; id <= UNDO_STACK_LIMIT + 20; id += 1) {
      snapshot = khataReducer(snapshot, {
        kind: "add",
        entryType: "expense",
        entry: entry(id),
      });
    }
    expect(snapshot.undoStack).toHaveLength(UNDO_STACK_LIMIT);
    /* The oldest additions fall off first, so undo still reverses the newest. */
    expect(snapshot.undoStack[snapshot.undoStack.length - 1].record.id).toBe(UNDO_STACK_LIMIT + 20);
  });

  it("updates a record in place without touching the undo stack", () => {
    const next = apply(
      state([], [entry(1, 100)]),
      { kind: "update", entryType: "expense", id: 1, entry: entry(1, 250) },
    );
    expect(next.expense[0].amount).toBe(250);
    expect(next.undoStack).toHaveLength(0);
  });

  it("removing a record also drops it from undo, so undo cannot resurrect it", () => {
    const next = apply(
      state(),
      { kind: "add", entryType: "expense", entry: entry(1) },
      { kind: "remove", entryType: "expense", id: 1 },
    );
    expect(next.expense).toHaveLength(0);
    expect(next.undoStack).toHaveLength(0);
  });

  it("replaceAll clears the ledger and the undo history", () => {
    const next = apply(
      state([entry(1)], [entry(2)]),
      { kind: "replaceAll", income: [entry(9)], expense: [] },
    );
    expect(next.income.map((row) => row.id)).toEqual([9]);
    expect(next.expense).toHaveLength(0);
    expect(next.undoStack).toEqual([]);
  });

  it("merge appends both kinds without duplicating ids", () => {
    const next = apply(
      state([entry(1)], []),
      { kind: "merge", income: [entry(2)], expense: [entry(3)] },
    );
    expect(next.income.map((row) => row.id)).toEqual([1, 2]);
    expect(next.expense.map((row) => row.id)).toEqual([3]);
  });
});

describe("makeRecord", () => {
  it("writes the ISO timestamp, attribution and the entry path", () => {
    const record = makeRecord(
      { type: "expense", amount: 500, detail: "چائے", addedBy: "staff", via: "voice" },
      42,
    );
    expect(record.id).toBe(42);
    expect(record.dateISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.addedBy).toBe("staff");
    expect(record.via).toBe("voice");
    expect(record.account).toBe("cash");
  });

  it("defaults to the owner and the manual path", () => {
    const record = makeRecord({ type: "income", amount: 10, detail: "x" }, 7);
    expect(record.addedBy).toBe("owner");
    expect(record.via).toBe("manual");
  });
});
