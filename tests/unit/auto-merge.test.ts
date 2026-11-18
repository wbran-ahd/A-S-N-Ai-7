/**
 * The automatic cloud pull after account recovery must happen **once per device
 * and account**. These tests pin the marker that makes that true: a repeated
 * merge would rewrite the pre-merge backup and the whole ledger on every start.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTO_MERGE_KEY, loadAutoMergedUids, markAutoMerged } from "@/lib/khata";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

let store: Map<string, string>;
let failWrites: boolean;

function useFakeStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("QuotaExceededError");
        store.set(key, value);
      },
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  store = new Map();
  failWrites = false;
  useFakeStorage();
});

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("auto-merge device marker", () => {
  it("starts empty on a fresh device", () => {
    expect(loadAutoMergedUids()).toEqual([]);
  });

  it("records an account once it has been merged", () => {
    markAutoMerged("uid-1");
    expect(loadAutoMergedUids()).toEqual(["uid-1"]);
  });

  it("does not duplicate an account merged again", () => {
    markAutoMerged("uid-1");
    markAutoMerged("uid-1");
    expect(loadAutoMergedUids()).toEqual(["uid-1"]);
  });

  it("keeps one entry per account on the same device", () => {
    markAutoMerged("uid-1");
    markAutoMerged("uid-2");
    expect(loadAutoMergedUids()).toEqual(["uid-1", "uid-2"]);
  });

  it("keeps only the most recent accounts", () => {
    for (let i = 0; i < 12; i += 1) markAutoMerged(`uid-${i}`);
    const uids = loadAutoMergedUids();
    expect(uids).toHaveLength(10);
    expect(uids.at(-1)).toBe("uid-11");
    expect(uids).not.toContain("uid-0");
  });

  it("ignores a corrupted or non-array value", () => {
    store.set(AUTO_MERGE_KEY, "{not json");
    expect(loadAutoMergedUids()).toEqual([]);
    store.set(AUTO_MERGE_KEY, JSON.stringify({ uid: "uid-1" }));
    expect(loadAutoMergedUids()).toEqual([]);
    store.set(AUTO_MERGE_KEY, JSON.stringify([1, null, "uid-1"]));
    expect(loadAutoMergedUids()).toEqual(["uid-1"]);
  });

  it("never throws when the device is full", () => {
    failWrites = true;
    expect(() => markAutoMerged("uid-1")).not.toThrow();
    expect(loadAutoMergedUids()).toEqual([]);
  });
});
