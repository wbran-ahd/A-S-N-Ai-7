import { useAuth } from "@/hooks/use-auth";
import { auth, db } from "@/lib/firebase";
import { handleFirestoreError, OperationType } from "@/lib/firestore-errors";
import {
  MAX_RECORDS,
  loadAutoMergedUids,
  markAutoMerged,
  nextId,
  type Budget,
  type DataState,
  type Entry,
  type EntryType,
  type RecurringEntry,
} from "@/lib/khata";
import { downloadJson } from "@/lib/backup-file";
import { track } from "@/lib/telemetry";
import { logError, logEvent } from "@/lib/logger";
import { t } from "@/lib/i18n";
import { AI_DAILY_LIMIT } from "@/lib/ai-limit";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type ValidatedCloudRow,
  validateCloudRows,
  mergeCloudRows,
  planUpload,
  recordFromEntry,
  type CloudRow,
} from "./use-merge-logic";
import {
  canUseCloud,
  loadDeletedIds,
  rememberDeletedIds,
  savePreDownloadBackup,
} from "@/lib/sync-safety";
import {
  loadPendingDeletions,
  savePendingDeletions,
  syncPendingDeletions,
  type DeletionSyncOutcome,
} from "@/lib/deletion-sync";

/** Rows per Firestore batch write — Firestore maximum is 500 ops per batch. */
const SYNC_CHUNK = 250;

/** How long a deleted record can be restored (task 3). */
export const RESTORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** How long to wait after the last change before saving quietly (task 2). */
const AUTO_SYNC_DELAY_MS = 6_000;

/** A tombstone that is still inside the restore window. */
export type RestorableRow = {
  row: CloudRow;
  deletedAt: number;
  daysLeft: number;
};

/** Where the Gemini key lives on this device. Never synced to Firestore. */
const DEVICE_KEY_STORAGE = "sauti_gemini_key";

/**
 * Snapshot captured before a download is applied. This is the R1 restore point
 * for the local ledger, not a Firestore-side backup.
 */
export type LedgerSnapshot = {
  income: Entry[];
  expense: Entry[];
  undoStack: { type: EntryType; record: Entry }[];
  capturedAt: number;
};


export function useSync(
  data: DataState,
  /**
   * Applies the merged cloud ledger back into the app (the page passes
   * `khata.replaceAll`). Optional so tests and any caller that only reads sync
   * state keep working unchanged.
   */
  applyCloud?: (income: Entry[], expense: Entry[]) => void,
) {
  const { user, isAuthenticated } = useAuth();

  const [cloudRecords, setCloudRecords] = useState<CloudRow[]>([]);
  const [cloudVersion, setCloudVersion] = useState(0);
  // Refreshed periodically so the 7-day restore window stays accurate without
  // calling an impure function during render.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [cloudSettings, setCloudSettings] = useState<{
    budgets?: Budget[];
    recurring?: RecurringEntry[];
  } | null>(null);

  const [budgetDraft, setBudgetDraft] = useState<Budget[] | null>(null);
  const [recurringDraft, setRecurringDraft] = useState<RecurringEntry[] | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [capWarning, setCapWarning] = useState(false);

  // Firestore real-time listener for records subcollection
  useEffect(() => {
    const currentUid = auth.currentUser?.uid;
    // Only attach remote Firestore listeners if a real Firebase authenticated session exists
    if (!isAuthenticated || !currentUid || currentUid !== user?.uid) {
      return;
    }

    const recordsPath = `users/${currentUid}/records`;
    const recordsCol = collection(db, "users", currentUid, "records");
    const unsubscribeRecords = onSnapshot(
      recordsCol,
      (snapshot) => {
        const rows: CloudRow[] = [];
        snapshot.forEach((docSnap) => {
          rows.push(docSnap.data() as CloudRow);
        });
        setCloudRecords(rows);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, recordsPath);
      },
    );

    const syncPath = `users/${currentUid}/sync/state`;
    const syncDocRef = doc(db, "users", currentUid, "sync", "state");
    const unsubscribeSync = onSnapshot(
      syncDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCloudVersion(snapshot.data()?.version || 0);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, syncPath);
      },
    );

    const settingsPath = `users/${currentUid}/settings/current`;
    const settingsDocRef = doc(db, "users", currentUid, "settings", "current");
    const unsubscribeSettings = onSnapshot(
      settingsDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCloudSettings(snapshot.data());
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, settingsPath);
      },
    );

    return () => {
      unsubscribeRecords();
      unsubscribeSync();
      unsubscribeSettings();
      setCloudRecords([]);
      setCloudVersion(0);
      setCloudSettings(null);
    };
  }, [isAuthenticated, user]);

  /* Both stores are re-read defensively: a truncated/tampered value used to be
     passed on as-is, and the budget/recurring screens call `.filter`/`.map` on
     it, which crashed the whole dashboard instead of ignoring the bad blob. */
  const localBudgets = useMemo<Budget[]>(() => {
    try {
      const b = localStorage.getItem("sauti_local_budgets");
      const parsed: unknown = b ? JSON.parse(b) : [];
      return Array.isArray(parsed) ? (parsed as Budget[]) : [];
    } catch {
      return [];
    }
  }, []);

  const localRecurring = useMemo<RecurringEntry[]>(() => {
    try {
      const r = localStorage.getItem("sauti_local_recurring");
      const parsed: unknown = r ? JSON.parse(r) : [];
      return Array.isArray(parsed) ? (parsed as RecurringEntry[]) : [];
    } catch {
      return [];
    }
  }, []);

  const cloudBudgets = Array.isArray(cloudSettings?.budgets)
    ? cloudSettings.budgets
    : undefined;
  const cloudRecurring = Array.isArray(cloudSettings?.recurring)
    ? cloudSettings.recurring
    : undefined;

  const budgets = useMemo(
    () => budgetDraft ?? cloudBudgets ?? localBudgets,
    [budgetDraft, cloudBudgets, localBudgets],
  );

  const recurring = useMemo(
    () => recurringDraft ?? cloudRecurring ?? localRecurring,
    [recurringDraft, cloudRecurring, localRecurring],
  );

  /* Audit 2.1: the key is a device secret and never syncs to Firestore in
     plaintext any more. It lives only in this device's localStorage, so the
     "cloud" name below is historical — it now just means a key exists here. */
  const hasCloudKey =
    keySaved ||
    Boolean(typeof window !== "undefined" && localStorage.getItem(DEVICE_KEY_STORAGE));

  const setBudgets: Dispatch<SetStateAction<Budget[]>> = useCallback(
    (value) =>
      setBudgetDraft((prev) => {
        const current = prev ?? cloudBudgets ?? localBudgets;
        return typeof value === "function" ? value(current) : value;
      }),
    [cloudBudgets, localBudgets],
  );

  const setRecurring: Dispatch<SetStateAction<RecurringEntry[]>> = useCallback(
    (value) =>
      setRecurringDraft((prev) => {
        const current = prev ?? cloudRecurring ?? localRecurring;
        return typeof value === "function" ? value(current) : value;
      }),
    [cloudRecurring, localRecurring],
  );

  /* ---- pending work, restore window and the record cap ---------------- */

  /**
   * Local rows in cloud shape. Comparing them with the live snapshot is what
   * makes an honest "not saved yet" count possible without a second store of
   * truth: `planUpload` already knows exactly what would be written.
   */
  const localRows = useMemo<CloudRow[]>(() => {
    const rows: CloudRow[] = [];
    for (const entry of data.income) rows.push(recordFromEntry(entry, "income"));
    for (const entry of data.expense) rows.push(recordFromEntry(entry, "expense"));
    return rows;
  }, [data]);

  const uploadPlan = useMemo(() => planUpload(localRows, cloudRecords), [localRows, cloudRecords]);

  /** Entries this device has that the cloud does not — the number shown in Urdu. */
  const pendingCount = isAuthenticated ? uploadPlan.writes.length : 0;

  /** `true` once everything on this device is already on the server. */
  const allSaved = isAuthenticated && pendingCount === 0 && !busy;

  const capUsage = useMemo(
    () => ({
      limit: MAX_RECORDS,
      income: data.income.length,
      expense: data.expense.length,
      overflowIncome: Math.max(0, data.income.length - MAX_RECORDS),
      overflowExpense: Math.max(0, data.expense.length - MAX_RECORDS),
    }),
    [data],
  );

  const upload = useCallback(async () => {
    const currentUid = auth.currentUser?.uid;
    if (!canUseCloud({ isAuthenticated, sessionUid: currentUid, userUid: user?.uid }) || !currentUid) {
      setStatus("کلاؤڈ سینک کے لیے آن لائن شناخت درکار ہے۔ تمام ڈیٹا ڈیوائس پر محفوظ ہے۔");
      return false;
    }

    setBusy(true);
    setStatus("سینک ہو رہا ہے…");
    /* Declared outside `try` so a failure after some chunks were written is
       reported as partial instead of "nothing happened". */
    let synced = 0;
    /* Deletions are delivered before the records, and their outcome is reported
       separately so a failed deletion can never look like a successful upload. */
    let deletions: DeletionSyncOutcome | null = null;
    try {
      const income = data.income.slice(-MAX_RECORDS);
      const expense = data.expense.slice(-MAX_RECORDS);
      const capped =
        income.length < data.income.length || expense.length < data.expense.length;
      setCapWarning(capped);

      const records: CloudRow[] = [
        ...income.map((entry) => recordFromEntry(entry, "income")),
        ...expense.map((entry) => recordFromEntry(entry, "expense")),
      ];

      const queuedDeletions = loadPendingDeletions();
      if (records.length === 0 && queuedDeletions.length === 0) {
        setStatus("سینک کے لیے کوئی انٹری موجود نہیں۔");
        return false;
      }

      /* Read the cloud state *before* writing. The write decision depends on it
         (a stale device must not roll back a newer edit from another device),
         and if this read fails we abort instead of writing blind. */
      const cloudSnap = await getDocs(collection(db, "users", currentUid, "records"));
      const cloudRows: CloudRow[] = [];
      cloudSnap.forEach((docSnap) => {
        cloudRows.push(docSnap.data() as CloudRow);
      });

      /* Queued deletions become tombstones: the document keeps its data and
         gains `deleted: true`, so nothing is ever removed from Firestore. A
         failed write stays in the queue and is reported below. */
      if (queuedDeletions.length > 0) {
        deletions = await syncPendingDeletions({
          pending: queuedDeletions,
          cloudRows,
          write: async (row) => {
            await setDoc(doc(db, "users", currentUid, "records", String(row.localId)), row);
          },
        });
        const saved = savePendingDeletions(deletions.remaining);
        if (!saved.persisted || saved.dropped > 0) {
          /* The queue is the only record of an undelivered deletion: losing it
             silently would let the record come back on another device. */
          logEvent("sync", "error", "pending deletion queue could not be stored", {
            persisted: saved.persisted,
            dropped: saved.dropped,
            remaining: deletions.remaining.length,
          });
        }
        if (deletions.failed > 0) {
          logEvent("sync", "error", "pending deletion could not be delivered", {
            failed: deletions.failed,
            failures: deletions.failures,
          });
        }
      }

      if (records.length === 0) {
        const delivered = (deletions?.applied ?? 0) + (deletions?.alreadyDeleted ?? 0);
        setStatus(
          deletions && deletions.failed > 0
            ? `${delivered} حذف کی اطلاع کلاؤڈ پر پہنچی، ${deletions.failed} نہیں پہنچ سکی — دوبارہ کوشش ہوگی۔ ڈیٹا ڈیوائس پر محفوظ ہے۔`
            : `${delivered} حذف کی اطلاع کلاؤڈ پر محفوظ ہو گئی۔`,
        );
        return (deletions?.failed ?? 0) === 0;
      }

      /* Tombstones written a moment ago are folded into the cloud view so the
         upload plan sees them (a stale local row must not overwrite one). */
      const cloudById = new Map<string, CloudRow>();
      for (const row of cloudRows) cloudById.set(String(row.localId), row);
      for (const row of deletions?.tombstones ?? []) cloudById.set(String(row.localId), row);

      const plan = planUpload(records, Array.from(cloudById.values()));
      const pending = plan.writes;

      for (let offset = 0; offset < pending.length; offset += SYNC_CHUNK) {
        const chunk = pending.slice(offset, offset + SYNC_CHUNK);
        const done = Math.min(offset + SYNC_CHUNK, pending.length);
        setStatus(`سینک ہو رہا ہے… (${done}/${pending.length})`);

        const batch = writeBatch(db);
        chunk.forEach((rec) => {
          const recRef = doc(db, "users", currentUid, "records", String(rec.localId));
          batch.set(recRef, rec);
        });

        await batch.commit();
        synced += chunk.length;
      }

      /* No pruning: a record missing from this device is not a deletion
         request. Deleting cloud documents here used to erase records that were
         created on another device (or that this device simply never had).
         Cloud-only documents are reported, never removed. */

      // Update sync version
      const newVersion = cloudVersion + 1;
      await setDoc(doc(db, "users", currentUid, "sync", "state"), {
        version: newVersion,
        updatedAt: Date.now(),
      });
      setCloudVersion(newVersion);

      const notes: string[] = [];
      if (plan.cloudNewer > 0) {
        notes.push(`${plan.cloudNewer} ریکارڈز کلاؤڈ پر نئے تھے، وہ محفوظ رکھے گئے`);
      }
      if (plan.cloudOnly > 0) {
        notes.push(`${plan.cloudOnly} صرف کلاؤڈ پر موجود ریکارڈز برقرار ہیں`);
      }
      if (plan.tombstoned > 0) {
        notes.push(`${plan.tombstoned} ریکارڈز دوسری ڈیوائس پر حذف ہو چکے ہیں، واپس نہیں کیے گئے`);
      }
      if (deletions && deletions.applied > 0) {
        notes.push(`${deletions.applied} حذف کی اطلاع کلاؤڈ پر پہنچ گئی`);
      }
      if (deletions && deletions.failed > 0) {
        notes.push(`${deletions.failed} حذف کی اطلاع نہیں پہنچ سکی، دوبارہ کوشش ہوگی`);
      }

      setStatus(
        synced > 0
          ? `${synced} انٹریز کلاؤڈ پر محفوظ ہو گئیں۔${
              notes.length > 0 ? ` (${notes.join("، ")})` : ""
            }${
              capped
                ? ` نوٹ: ہر قسم کی صرف تازہ ترین ${MAX_RECORDS} انٹریز سینک ہوتی ہیں، باقی ڈیوائس پر محفوظ ہیں۔`
                : ""
            }`
          : plan.unchanged > 0
            ? `${plan.unchanged} انٹریز پہلے سے کلاؤڈ پر ہم آہنگ ہیں۔${
                notes.length > 0 ? ` (${notes.join("، ")})` : ""
              }`
            : `کلاؤڈ پر پہلے سے نیا ڈیٹا موجود ہے، اس ڈیوائس کا ڈیٹا محفوظ رکھا گیا۔`,
      );
      logEvent("sync", "info", "records synced to firestore", {
        written: synced,
        unchanged: plan.unchanged,
        cloudNewer: plan.cloudNewer,
        cloudOnly: plan.cloudOnly,
        tombstoned: plan.tombstoned,
        deletionsApplied: deletions?.applied ?? 0,
        deletionsAlreadyDeleted: deletions?.alreadyDeleted ?? 0,
        deletionsMissing: deletions?.missing ?? 0,
        deletionsFailed: deletions?.failed ?? 0,
      });
      /* Records were saved, but a queued deletion that did not go through is
         still pending work — never report that as a plain success. */
      return (deletions?.failed ?? 0) === 0;
    } catch (error) {
      logError("sync", "upload to Firestore failed", error);
      const reason = error instanceof Error ? error.message : "سینک ناکام ہو گیا۔";
      setStatus(
        synced > 0
          ? `سینک ادھوری رہی — ${synced} انٹریز محفوظ ہو گئیں، باقی نہیں۔ (${reason}) ڈیٹا ڈیوائس پر محفوظ ہے۔`
          : reason,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [cloudVersion, data.expense, data.income, isAuthenticated, user]);

  /**
   * Safer download path for R1.
   *
   * This keeps the existing caller contract intact: it still returns
   * `{ income, expense } | null`, so the current UI handler does not need a
   * visual change. Internally it now:
   * - captures a restore snapshot before any merge is attempted,
   * - validates the current cloud payload before merge,
   * - merges deterministically by id, resolving conflicts with the per-record
   *   `updatedAt` rule that never drops a record (see `mergeCloudRows`),
   * - never resurrects a record this device deleted,
   * - leaves the local ledger untouched (returns `null`) whenever the payload is
   *   malformed, instead of replacing it with partial data.
   */
  const download = useCallback((): { income: Entry[]; expense: Entry[] } | null => {
    if (
      !auth.currentUser ||
      !canUseCloud({
        isAuthenticated,
        sessionUid: auth.currentUser.uid,
        userUid: user?.uid,
      })
    ) {
      setStatus("کلاؤڈ پر کوئی ڈیٹا موجود نہیں ہے۔ تمام ریکارڈز ڈیوائس پر موجود ہیں۔");
      return null;
    }
    if (cloudRecords.length === 0) {
      setStatus("کلاؤڈ پر کوئی ڈیٹا موجود نہیں ہے۔");
      return null;
    }

    const snapshot = captureSnapshot(data.income, data.expense, data.undoStack);
    /* Rollback copy first: whatever happens below, the ledger as it stands now
       can be recovered from this device (see `lib/sync-safety`). */
    if (!savePreDownloadBackup(data.income, data.expense)) {
      logEvent("sync", "warn", "pre-download backup could not be stored", {
        snapshotAt: snapshot.capturedAt,
      });
    }

    const outcomes = validateCloudRows(cloudRecords);
    const invalidCount = outcomes.filter((o) => o.ok === false).length;
    const validated = outcomes.filter(
      (o): o is { ok: true; row: ValidatedCloudRow } => o.ok,
    );
    const validatedRows: ValidatedCloudRow[] = validated.map((o) => o.row);

    if (invalidCount > 0) {
      setStatus(
        `کلاؤڈ ڈاؤن لوڈ کی پیش کش میں غیر معیاری ڈیٹا مل گیا — مقامی کھاتہ محفوظ رہا۔`,
      );
      logEvent("sync", "warn", "download blocked by invalid cloud rows", {
        invalid: invalidCount,
        snapshotAt: snapshot.capturedAt,
      });
      return null;
    }

    if (validatedRows.length === 0) {
      setStatus("کلاؤڈ پر کوئی درست ریکارڈ موجود نہیں ہے۔");
      return null;
    }

    /* Records deleted on this device are not pulled back in — the cloud copy is
       kept (another device may still need it), but this ledger stays deleted. */
    const merge = mergeCloudRows(
      data.income,
      data.expense,
      validatedRows,
      loadDeletedIds(),
    );

    /* Tombstones are remembered on this device too: if the cloud document ever
       disappears, the record still must not come back through another payload. */
    if (merge.tombstoneIds.length > 0) rememberDeletedIds(merge.tombstoneIds);

    setStatus(
      `${merge.added} نئی انٹریز شامل، ${merge.kept} موجودہ ریکارڈ محفوظ، ${merge.conflicts} تعاملات خودکار طور پر حل۔${
        merge.tombstoned > 0
          ? ` ${merge.tombstoned} ریکارڈ دوسری ڈیوائس پر حذف ہو چکے تھے، ہٹا دیے گئے۔`
          : ""
      }${
        merge.skippedDeleted > 0
          ? ` ${merge.skippedDeleted} حذف شدہ ریکارڈ واپس نہیں لائے گئے۔`
          : ""
      }`,
    );

    return { income: merge.income, expense: merge.expense };
  }, [cloudRecords, data.expense, data.income, data.undoStack, isAuthenticated, user]);

  /* ---- first load after account recovery ------------------------------- */

  /**
   * Pulls the cloud ledger automatically once this device is signed in to a
   * **permanent** account (email linked, or the email link opened on a new
   * phone). Before this the user had to find Settings → Cloud Download and
   * press it; the runbook meanwhile promised the data would arrive by itself.
   *
   * Safety: `download()` merges (it never drops a local record), validates the
   * payload first, refuses malformed rows, keeps this device's deletions and
   * writes a pre-merge backup.
   *
   * Timing: **once per device and account** — the first time that account is
   * seen here (new phone after recovery, or after linking). Every later start
   * relies on the live `onSnapshot` listener for freshness, so start-up does
   * not rewrite the pre-download backup and the whole ledger again. The
   * device record is persisted (`loadAutoMergedUids`); a failure is retried on
   * the next snapshot instead of being written off for the session.
   */
  const [autoMergedUids] = useState<string[]>(loadAutoMergedUids);
  const autoMergedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!applyCloud) return;
    if (!isAuthenticated || !user?.uid || !user.email) return;
    if (cloudRecords.length === 0) return;
    if (autoMergedUids.includes(user.uid)) return;
    if (autoMergedSessionRef.current === user.uid) return;

    const pulled = download();
    if (!pulled) return;

    /* Applied before the device is recorded: if anything throws in between, the
       next start simply merges again (idempotent) instead of leaving a device
       marked as synced with no data to show for it. */
    applyCloud(pulled.income, pulled.expense);
    markAutoMerged(user.uid);
    autoMergedSessionRef.current = user.uid;
    logEvent("sync", "info", "cloud ledger merged automatically after sign-in", {
      income: pulled.income.length,
      expense: pulled.expense.length,
    });
  }, [applyCloud, autoMergedUids, cloudRecords.length, download, isAuthenticated, user]);

  /* ---- automatic, debounced cloud save (task 2) ------------------------ */

  const autoSyncRef = useRef(false);
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  }, [upload]);

  /**
   * Quietly saves a few seconds after the ledger changes.
   *
   * Deliberate properties:
   *   • debounced, so typing five entries is one write burst, not five;
   *   • skipped when offline — the pending count stays visible instead;
   *   • never concurrent with a manual upload;
   *   • tombstones are delivered by the same `upload` path, so deleting on one
   *     device still reaches the other devices.
   */
  useEffect(() => {
    if (!isAuthenticated || pendingCount === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (busy) return;

    const timer = window.setTimeout(() => {
      if (autoSyncRef.current) return;
      autoSyncRef.current = true;
      track("cloud_upload_clicked", { auto: true, entries: pendingCount });
      void uploadRef.current().finally(() => {
        autoSyncRef.current = false;
      });
    }, AUTO_SYNC_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [busy, isAuthenticated, pendingCount]);

  /* A phone that regains signal saves without the user doing anything. */
  useEffect(() => {
    if (!isAuthenticated) return;
    const onOnline = () => {
      if (autoSyncRef.current) return;
      autoSyncRef.current = true;
      void uploadRef.current().finally(() => {
        autoSyncRef.current = false;
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [isAuthenticated]);

  const persistSettings = useCallback(async () => {
    // Always persist locally
    try {
      localStorage.setItem("sauti_local_budgets", JSON.stringify(budgets));
      localStorage.setItem("sauti_local_recurring", JSON.stringify(recurring));
    } catch {
      // ignore
    }

    const currentUid = auth.currentUser?.uid;
    if (!isAuthenticated || !currentUid || currentUid !== user?.uid) {
      setStatus("سیٹنگز مقامی طور پر محفوظ ہو گئیں۔");
      return;
    }

    try {
      const settingsRef = doc(db, "users", currentUid, "settings", "current");
      await setDoc(
        settingsRef,
        {
          budgets,
          recurring,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      setStatus("سیٹنگز محفوظ ہو گئیں۔");
    } catch (error) {
      logError("sync", "persistSettings to Firestore failed", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${currentUid}/settings/current`);
    }
  }, [budgets, isAuthenticated, recurring, user]);

  const saveGeminiKey = useCallback(
    async (key: string) => {
      try {
        /* The key is stored device-local only. The old code also wrote it as
           plaintext into Firestore (`…/settings/current`), where any rules slip
           would expose it — that write is gone. AI itself now runs through the
           server-side Cloud Function, so this key is an optional expert escape
           hatch rather than the main path. */
        localStorage.setItem(DEVICE_KEY_STORAGE, key);
        setKeySaved(true);
        setStatus(t("aiKeySaved"));
        return true;
      } catch (error) {
        logError("sync", "saveGeminiKey failed", error);
        setStatus(
          error instanceof Error
            ? error.message
            : t("aiKeySaveFailed"),
        );
        return false;
      }
    },
    [],
  );

  /* ---- recently deleted (7-day restore window) ------------------------ */

  /**
   * Tombstones from the last seven days, newest first.
   *
   * Restoring does **not** flip `deleted` back to false — the security rules
   * deliberately forbid that, because a resurrection path is exactly how a
   * stale device could undo a deletion. A restore therefore writes a *new*
   * record with a new id, built from the tombstone's own data.
   */
  const restorable = useMemo<RestorableRow[]>(() => {
    const now = nowMs;
    return cloudRecords
      .filter((row) => row.deleted === true && typeof row.deletedAt === "number")
      .filter((row) => now - (row.deletedAt as number) < RESTORE_WINDOW_MS)
      .sort((a, b) => (b.deletedAt as number) - (a.deletedAt as number))
      .map((row) => {
        const deletedAt = row.deletedAt as number;
        return {
          row,
          deletedAt,
          daysLeft: Math.max(0, Math.ceil((RESTORE_WINDOW_MS - (now - deletedAt)) / 86_400_000)),
        };
      });
  }, [cloudRecords, nowMs]);

  /** Builds the replacement record for a tombstone (new id, same content). */
  const restoreDeleted = useCallback((row: CloudRow): { kind: EntryType; entry: Entry } => {
    const now = new Date();
    const entry: Entry = {
      id: nextId(),
      amount: row.amount,
      detail: row.detail ?? "",
      category: row.category ?? "عام",
      icon: row.icon ?? "fa-tag",
      monthKey: row.monthKey,
      date: now.toLocaleDateString("ur-PK"),
      time: now.toLocaleTimeString("ur-PK", { hour: "2-digit", minute: "2-digit" }),
      timestamp: now.getTime(),
      updatedAt: now.getTime(),
      account: row.account === "bank" ? "bank" : "cash",
      dateISO: now.toISOString(),
      addedBy: "owner",
      via: "manual",
    };
    track("restore_deleted", { kind: row.kind });
    return { kind: row.kind, entry };
  }, []);

  /**
   * Archive of the records *beyond* the cloud cap, for the month cleanup task.
   * Nothing is deleted locally; this is only a file the user can keep.
   */
  const exportOverflow = useCallback((): boolean => {
    const income = data.income.slice(0, Math.max(0, data.income.length - MAX_RECORDS));
    const expense = data.expense.slice(0, Math.max(0, data.expense.length - MAX_RECORDS));
    if (income.length === 0 && expense.length === 0) {
      setStatus("کوئی اضافی (اوور فلو) ریکارڈ موجود نہیں ہے۔");
      return false;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const ok = downloadJson(`sauti-baqaya-archive-${stamp}.json`, {
      exportedAt: new Date().toISOString(),
      note: "یہ وہ ریکارڈ ہیں جو کلاؤڈ کی حد سے پرے ہیں — محفوظ رکھیں۔",
      income,
      expense,
    });
    setStatus(
      ok
        ? `آرکائیو ڈاؤن لوڈ ہو گیا (${income.length + expense.length} انٹریز)۔`
        : "آرکائیو ڈاؤن لوڈ نہیں ہو سکا۔",
    );
    return ok;
  }, [data.expense, data.income]);

  return {
    isAuthenticated,
    cloudVersion,
    pendingCount,
    allSaved,
    restorable,
    restoreDeleted,
    capUsage,
    exportOverflow,
    cloudCount: cloudRecords.length,
    aiHasKey: hasCloudKey,
    // Audit #8: the display budget was an inline magic number; it now comes
    // from one documented constant. (Note: nothing server-side enforces it yet
    // — see the residual-risk section of the audit report.)
    aiRemaining: AI_DAILY_LIMIT,
    budgets,
    setBudgets,
    recurring,
    setRecurring,
    hasCloudKey,
    capWarning,
    status,
    setStatus,
    busy,
    upload,
    download,
    persistSettings,
    saveGeminiKey,
  };
}

/**
 * Restore point for a download.
 *
 * The download path never mutates state itself — it returns merged lists that
 * the caller applies atomically — so this snapshot is only an audit trail for
 * the blocked/invalid case. It used to be a stub that threw
 * `UNIMPLEMENTED_snapshot`, which made every download fail before validation
 * ran; capturing the live ledger is what makes the button work again.
 */
function captureSnapshot(
  income: Entry[],
  expense: Entry[],
  undoStack: LedgerSnapshot["undoStack"],
): LedgerSnapshot {
  return { income, expense, undoStack, capturedAt: Date.now() };
}
