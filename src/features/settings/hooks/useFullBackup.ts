/**
 * مکمل بیک اپ — download and restore the portable file.
 *
 * The restore writes storage directly (see `lib/full-backup`) and then reloads
 * the app, because ledger, prefs, budgets, recurring rules and the party book
 * all live in different hooks and stores. A reload is the only way to guarantee
 * every screen shows the restored data at once instead of a half-old UI.
 */
import { useCallback, useState, type ChangeEvent } from "react";
import {
  MAX_FULL_BACKUP_BYTES,
  buildFullBackup,
  fullBackupFileName,
  fullBackupJson,
  restoreFullBackup,
} from "@/lib/full-backup";
import { logError } from "@/lib/logger";
import { track } from "@/lib/telemetry";

/** How long the success message stays visible before the reload. */
const RELOAD_DELAY_MS = 1600;

export function useFullBackup() {
  const [fullBackupMsg, setFullBackupMsg] = useState("");
  const [restoring, setRestoring] = useState(false);

  const exportFullBackup = useCallback(() => {
    const backup = buildFullBackup();
    const blob = new Blob([fullBackupJson(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fullBackupFileName();
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFullBackupMsg(
      `مکمل بیک اپ ڈاؤن لوڈ ہو گیا: ${backup.ledger.income.length + backup.ledger.expense.length} انٹریز، ${backup.partyBook.parties.length} گاہک/سپلائر۔`,
    );
    track("export_full_backup");
  }, []);

  const handleRestoreFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_FULL_BACKUP_BYTES) {
      setFullBackupMsg("فائل بہت بڑی ہے — یہ صوتی بقیہ کا مکمل بیک اپ نہیں لگتی۔");
      return;
    }

    setRestoring(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const outcome = restoreFullBackup(String(reader.result ?? ""));
        track("restore_full_backup");
        setFullBackupMsg(
          `بحالی مکمل: ${outcome.income} آمدنی، ${outcome.expense} خرچہ، ${outcome.parties} گاہک/سپلائر، ${outcome.partyTxns} لین دین۔ ایپ دوبارہ کھل رہی ہے…`,
        );
        window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
      } catch (error) {
        logError("import", "full backup restore failed", error);
        setFullBackupMsg(
          error instanceof Error ? error.message : "بیک اپ بحال نہیں ہو سکا۔",
        );
        setRestoring(false);
      }
    };
    reader.onerror = () => {
      setFullBackupMsg("فائل پڑھی نہیں جا سکی — دوبارہ کوشش کریں۔");
      setRestoring(false);
    };
    reader.readAsText(file);
  }, []);

  return {
    fullBackupMsg,
    restoring,
    exportFullBackup,
    handleRestoreFile,
  };
}
