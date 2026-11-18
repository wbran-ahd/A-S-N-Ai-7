import { useRef, useState } from "react";
import { Modal } from "@/components/sauti/Modal";
import { ShareCard } from "@/components/sauti/ShareCard";
import { ConfirmDialog } from "@/lib/confirm";
import { RecurringAdder } from "./RecurringAdder.tsx";
import {
  CATEGORY_CATALOG,
  MAX_RECORDS,
  formatMonthName,
  formatNumber,
  type DigitStyle,
  type FontScale,
} from "@/lib/khata";
import type { RestorableRow } from "@/hooks/use-sync";
import { speakUrdu } from "@/lib/tts";
import { BRAND, supportUrl } from "@/lib/brand";
import { track } from "@/lib/telemetry";
import { t } from "@/lib/i18n";
import type { PinMode } from "@/components/sauti/StaffPinModal";
import type { Budget, RecurringEntry } from "@/lib/khata";

const inputCls =
  "w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-sky-400 font-sans";
const smallBtn =
  "px-3 py-1.5 rounded-xl text-xs font-bold transition border font-sans flex items-center gap-1";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  apiKeyDraft: string;
  setApiKeyDraft: (val: string) => void;
  onSaveApiKey: () => void;
  digitStyle: DigitStyle;
  onSetDigitStyle: (style: DigitStyle) => void;
  budgets: Budget[];
  setBudgets: React.Dispatch<React.SetStateAction<Budget[]>>;
  onPersistSettings: () => void;
  recurring: RecurringEntry[];
  setRecurring: React.Dispatch<React.SetStateAction<RecurringEntry[]>>;
  onExportCsv: () => void;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importMsg: string;
  isAuthenticated: boolean;
  syncBusy: boolean;
  cloudVersion: number | string;
  syncStatus: string;
  capWarning: boolean;
  uploadConfirmOpen: boolean;
  setUploadConfirmOpen: (open: boolean) => void;
  onConfirmUpload: () => void;
  onDownload: () => void;
  ttsEnabled: boolean;
  onSetTtsEnabled: (enabled: boolean) => void;
  ttsRate: number;
  onSetTtsRate: (rate: number) => void;
  activeMonth: string;
  onExportReportPdf: () => void;
  onExportReportExcel: () => void;
  onExportDiagnostics: () => void;
  onClearDiagnostics: () => void;
  hasPin: boolean;
  staffError: string | null;
  pinOpen: boolean;
  onOpenPin: (mode: PinMode) => void;
  onLockSalesman: () => void;
  /* --- task 2/3/12/13 additions ------------------------------------- */
  /** Records on this device that the cloud does not have yet. */
  pendingCount: number;
  /** Tombstones still inside the 7-day restore window. */
  restorable: RestorableRow[];
  onRestore: (row: RestorableRow["row"]) => void;
  /** Per-kind usage of the cloud record cap. */
  capUsage: {
    limit: number;
    income: number;
    expense: number;
    overflowIncome: number;
    overflowExpense: number;
  };
  onExportOverflow: () => void;
  fontScale: FontScale;
  onSetFontScale: (scale: FontScale) => void;
  /* --- account recovery (email link) -------------------------------- */
  /** Present once this account is linked to (or signed in with) an email. */
  accountEmail?: string;
  /** A sign-in link is open and waiting to be confirmed. */
  emailLinkPending: boolean;
  accountBusy: boolean;
  /** Last Urdu result of sending/finishing the link, if any. */
  accountMessage: string | null;
  /** Controls the colour so a failure is never shown in green. */
  accountMessageTone: "ok" | "error";
  onSubmitEmail: (email: string) => void;
}

export function SettingsModal({
  open,
  onClose,
  apiKeyDraft,
  setApiKeyDraft,
  onSaveApiKey,
  digitStyle,
  onSetDigitStyle,
  budgets,
  setBudgets,
  onPersistSettings,
  recurring,
  setRecurring,
  onExportCsv,
  onImportFile,
  importMsg,
  isAuthenticated,
  syncBusy,
  cloudVersion,
  syncStatus,
  capWarning,
  uploadConfirmOpen,
  setUploadConfirmOpen,
  onConfirmUpload,
  onDownload,
  ttsEnabled,
  onSetTtsEnabled,
  ttsRate,
  onSetTtsRate,
  activeMonth,
  onExportReportPdf,
  onExportReportExcel,
  onExportDiagnostics,
  onClearDiagnostics,
  hasPin,
  staffError,
  pinOpen,
  onOpenPin,
  onLockSalesman,
  pendingCount,
  restorable,
  onRestore,
  capUsage,
  onExportOverflow,
  fontScale,
  onSetFontScale,
  accountEmail,
  emailLinkPending,
  accountBusy,
  accountMessage,
  accountMessageTone,
  onSubmitEmail,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t("settingsTitle")}
      scrollable
      fontSans
    >
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <i className="fas fa-key text-sky-400"></i> {t("settingsTitle")}
        </h2>
        <button
          onClick={onClose}
          aria-label={t("cancel")}
          className="text-white/50 hover:text-white transition"
        >
          <i className="fas fa-times text-xl"></i>
        </button>
      </div>

      {/* Account recovery — the cloud khata is tied to this browser until the
          anonymous session is linked to an email (see use-auth). */}
      <div className="mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-shield-heart text-emerald-300 ml-1"></i> کھاتہ محفوظ کریں (نئے فون کے لیے)
        </h3>
        {accountEmail ? (
          <p className="text-[11px] leading-5 text-white/60">
            <span className="text-emerald-300 font-bold">✓ یہ کھاتہ محفوظ ہے</span> — ای میل:{" "}
            <bdi dir="ltr" className="font-sans text-white/80">
              {accountEmail}
            </bdi>
            <br />
            نئے فون یا نئے براؤزر پر یہی ای میل درج کریں، لنک کھولیں — پورا کھاتہ واپس آ جائے گا۔
          </p>
        ) : (
          <>
            <p className="text-[11px] leading-5 text-white/50">
              ابھی یہ کھاتہ صرف اسی براؤزر میں محفوظ ہے۔ اپنا ای میل درج کریں — ہم ایک لنک
              بھیجیں گے؛ لنک کھولتے ہی یہی کھاتہ ای میل سے جڑ جائے گا (موجودہ ڈیٹا ویسے ہی
              رہے گا) اور نئے فون پر بھی کھل سکے گا۔
            </p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              aria-label="کھاتہ بحال کرنے کے لیے ای میل"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              placeholder="aap@example.com"
              className={`${inputCls} mt-2 text-left`}
            />
            <button
              type="button"
              onClick={() => onSubmitEmail(emailDraft)}
              disabled={accountBusy || emailDraft.trim().length === 0}
              className={`${smallBtn} w-full mt-2 justify-center bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/40 disabled:opacity-50`}
            >
              <i className="fas fa-envelope"></i>{" "}
              {accountBusy
                ? "بھیجا جا رہا ہے…"
                : emailLinkPending
                  ? "کھاتہ جوڑیں"
                  : "ای میل لنک بھیجیں"}
            </button>
            <p className="mt-1 text-[10px] leading-4 text-white/35">
              لنک صرف ایک بار کام کرتا ہے اور کچھ منٹ میں پرانا ہو جاتا ہے۔
            </p>
          </>
        )}
        {accountMessage && (
          <p
            role={accountMessageTone === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-2 text-[11px] leading-5 ${
              accountMessageTone === "error" ? "text-rose-200" : "text-emerald-200"
            }`}
          >
            {accountMessage}
          </p>
        )}
      </div>

      {/* Gemini key */}
      <div className="space-y-2 text-sm text-white/80 mb-5">
        <p className="text-xs leading-5">
          <span className="text-emerald-300 font-bold">✓ اے آئی شامل ہے</span> — تجزیہ اب
          ایپ کے سرور سے چلتا ہے، اس لیے کوئی کی درج کرنے کی ضرورت نہیں اور آپ کی
          ذاتی چابی محفوظ رہتی ہے۔
        </p>
        <p className="text-[11px] leading-5 text-white/45">
          اپنی ذاتی جیمینی چابی صرف ماہرین کے لیے ہے (اختیاری) — {t("geminiKeyIntro")}
        </p>
        <input
          type="password"
          value={apiKeyDraft}
          onChange={(e) => setApiKeyDraft(e.target.value)}
          placeholder="AIzaSy..."
          className={inputCls}
        />
        <button
          onClick={onSaveApiKey}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2.5 rounded-xl transition shadow-lg"
        >
          {t("saveSettings")}
        </button>
      </div>

      {/* Text size (task 13): the root font size only — no layout change. */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">متن کا سائز</h3>
        <div className="flex gap-2">
          {([
            { scale: "normal", label: "عام" },
            { scale: "large", label: "بڑا" },
            { scale: "xlarge", label: "بہت بڑا" },
          ] as const).map((option) => (
            <button
              key={option.scale}
              type="button"
              aria-pressed={fontScale === option.scale}
              onClick={() => onSetFontScale(option.scale)}
              className={`${smallBtn} flex-1 ${
                fontScale === option.scale
                  ? "bg-sky-500/25 text-sky-200 border-sky-400/50"
                  : "bg-white/5 text-white/70 border-white/20"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-white/40">
          دھوپ میں پڑھنے کے لیے سائز بڑا کریں — ترتیب ویسی ہی رہتی ہے۔
        </p>
      </div>

      {/* Digit style */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">اندازِ شمار</h3>
        <div className="flex gap-2">
          <button
            onClick={() => onSetDigitStyle("latin")}
            className={`${smallBtn} flex-1 ${
              digitStyle === "latin"
                ? "bg-sky-500/25 text-sky-200 border-sky-400/50"
                : "bg-white/5 text-white/70 border-white/20"
            }`}
          >
            رومن ہندسے (500)
          </button>
          <button
            onClick={() => onSetDigitStyle("eastern")}
            className={`${smallBtn} flex-1 ${
              digitStyle === "eastern"
                ? "bg-sky-500/25 text-sky-200 border-sky-400/50"
                : "bg-white/5 text-white/70 border-white/20"
            }`}
          >
            مشرقی ہندسے (۵۰۰)
          </button>
        </div>
      </div>

      {/* Budgets */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-bullseye text-rose-300 ml-1"></i> قسم وار بجٹ (ماہانہ)
        </h3>
        <div className="space-y-2">
          {CATEGORY_CATALOG.map((category) => {
            const budget = budgets.find((b) => b.category === category.name);
            return (
              <div key={category.name} className="flex items-center gap-2">
                <span className="text-xs text-white/70 w-24 shrink-0">{category.name}</span>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="0"
                  value={budget ? budget.limit : ""}
                  onChange={(e) => {
                    const limit = Number.parseFloat(e.target.value) || 0;
                    setBudgets((prev) => {
                      const rest = prev.filter((b) => b.category !== category.name);
                      return limit > 0
                        ? [...rest, { category: category.name, limit }].sort((a, b) =>
                            a.category.localeCompare(b.category),
                          )
                        : rest;
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
        <button
          onClick={onPersistSettings}
          className={`${smallBtn} w-full mt-2 bg-white/10 hover:bg-white/20 text-white border-white/20`}
        >
          بجٹ محفوظ کریں
        </button>
      </div>

      {/* Recurring entries */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-rotate text-emerald-300 ml-1"></i> ماہانہ خودکار اندراج
        </h3>
        {recurring.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {recurring.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  aria-label={entry.label}
                  onChange={(e) =>
                    setRecurring((prev) =>
                      prev.map((r) =>
                        r.id === entry.id ? { ...r, enabled: e.target.checked } : r,
                      ),
                    )
                  }
                />
                <span className="flex-1 text-white/80">{entry.label}</span>
                <span className="text-[10px] text-white/40">
                  {entry.kind === "expense" ? "خرچہ" : "آمدنی"}
                </span>
                <span
                  className={entry.kind === "expense" ? "text-rose-300" : "text-emerald-300"}
                >
                  {formatNumber(entry.amount, digitStyle)} روپے
                </span>
                <button
                  onClick={() =>
                    setRecurring((prev) => prev.filter((r) => r.id !== entry.id))
                  }
                  aria-label={t("delete")}
                  className="text-rose-400/70 hover:text-rose-300"
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
          </div>
        )}
        <RecurringAdder
          onAdd={(label, amount, kind) =>
            setRecurring((prev) => [
              ...prev,
              { id: `${Date.now()}`, label, amount, enabled: true, kind },
            ])
          }
        />
        <button
          onClick={onPersistSettings}
          className={`${smallBtn} w-full mt-2 bg-white/10 hover:bg-white/20 text-white border-white/20`}
        >
          ماہانہ اندراج محفوظ کریں
        </button>
      </div>

      {/* Backup & restore */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-database text-sky-300 ml-1"></i> بیک اپ اور بحالی
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onExportCsv}
            className={`${smallBtn} flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20`}
          >
            <i className="fas fa-file-csv"></i> CSV ڈاؤن لوڈ
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`${smallBtn} flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20`}
          >
            <i className="fas fa-file-import"></i> CSV/JSON واپس لائیں
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={onImportFile}
        />
        {importMsg && <p className="text-[11px] text-emerald-300 mt-2">{importMsg}</p>}
      </div>

      {/* Cloud sync */}
      <div className="mb-2">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-cloud text-sky-300 ml-1"></i> کلاؤڈ سینک
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setUploadConfirmOpen(true)}
            disabled={syncBusy || !isAuthenticated}
            className={`${smallBtn} flex-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40 disabled:opacity-50`}
          >
            <i className="fas fa-cloud-arrow-up"></i> اپ لوڈ
          </button>
          <button
            onClick={onDownload}
            className={`${smallBtn} flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20`}
          >
            <i className="fas fa-cloud-arrow-down"></i> ڈاؤن لوڈ
          </button>
        </div>
        <p className="text-[11px] text-white/40 mt-2">ورژن: {cloudVersion}</p>
        {/* Live cloud state in plain Urdu (task 2). */}
        <p
          role="status"
          aria-live="polite"
          className={`text-[11px] mt-1 ${
            !isAuthenticated
              ? "text-white/60"
              : pendingCount > 0
                ? "text-amber-300/90"
                : "text-emerald-300/80"
          }`}
        >
          {!isAuthenticated
            ? "آن لائن شناخت نہیں — سارا کھاتہ اس ڈیوائس پر محفوظ ہے۔"
            : pendingCount > 0
              ? `${pendingCount} انٹریاں ابھی کلاؤڈ پر محفوظ نہیں — خودکار سینک جاری ہے۔`
              : "آج کا سارا کھاتہ کلاؤڈ پر محفوظ ہے۔"}
        </p>
        {syncStatus && <p className="text-[11px] text-white/60 mt-1">{syncStatus}</p>}
        {/* Cloud cap progress (task 12) — shown before it becomes a surprise. */}
        <p className="text-[11px] text-white/50 mt-1">
          کلاؤڈ حد: آمدنی {formatNumber(capUsage.income, digitStyle)}/
          {formatNumber(capUsage.limit, digitStyle)} · خرچہ{" "}
          {formatNumber(capUsage.expense, digitStyle)}/
          {formatNumber(capUsage.limit, digitStyle)}
        </p>
        {(capUsage.overflowIncome > 0 || capUsage.overflowExpense > 0) && (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2">
            <p className="text-[11px] leading-5 text-amber-200">
              حد سے پرے {formatNumber(capUsage.overflowIncome + capUsage.overflowExpense, digitStyle)}{" "}
              پرانے ریکارڈ کلاؤڈ پر نہیں جائیں گے — انہیں فائل میں محفوظ کر لیں۔
            </p>
            <button
              type="button"
              onClick={onExportOverflow}
              className={`${smallBtn} w-full mt-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/40`}
            >
              <i className="fas fa-box-archive"></i> پرانا کھاتہ آرکائیو کریں
            </button>
          </div>
        )}
        {capWarning && (
          <p className="text-[11px] text-amber-300/90 mt-1">
            نوٹ: کلاؤڈ اپ لوڈ میں ہر قسم کی صرف تازہ ترین {MAX_RECORDS} انٹریز سینک ہوتی
            ہیں — باقی انٹریز اس ڈیوائس پر محفوظ ہیں۔
          </p>
        )}
        {/* 7-day restore window (task 3). Restore writes a NEW record; the rules
            deliberately forbid resurrecting a tombstone. */}
        {restorable.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold text-white/70">
              حالیہ حذف شدہ — سات دن تک بحال ہو سکتے ہیں
            </p>
            <div className="mt-1 space-y-1.5">
              {restorable.slice(0, 5).map(({ row, daysLeft }) => (
                <div
                  key={`${row.kind}-${row.localId}`}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2 py-1.5"
                >
                  <span className="flex-1 truncate text-[11px] text-white/70">
                    {row.detail || row.category} — {formatNumber(row.amount, digitStyle)} روپے
                  </span>
                  <span className="text-[10px] text-white/40">{daysLeft} دن</span>
                  <button
                    type="button"
                    onClick={() => onRestore(row)}
                    className={`${smallBtn} bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40`}
                  >
                    بحال کریں
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Urdu voice feedback */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-volume-high text-emerald-300 ml-1"></i> اردو آواز (تصدیق)
        </h3>
        <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/75">
          <span>اندراج کے بعد آواز میں تصدیق سنیں</span>
          <input
            type="checkbox"
            checked={ttsEnabled}
            onChange={(e) => onSetTtsEnabled(e.target.checked)}
          />
        </label>
        <div className="mt-2 flex gap-2">
          {[
            { rate: 0.85, label: "آہستہ" },
            { rate: 0.95, label: "عام" },
            { rate: 1.1, label: "تیز" },
          ].map((option) => (
            <button
              key={option.rate}
              type="button"
              aria-pressed={ttsRate === option.rate}
              onClick={() => onSetTtsRate(option.rate)}
              className={`${smallBtn} flex-1 ${
                ttsRate === option.rate
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-white/5 text-white/60 border-white/15 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            speakUrdu("صوتی بقیہ — آواز کی جانچ۔ پانچ سو روپے درج ہو گئے۔", {
              enabled: true,
              rate: ttsRate,
            })
          }
          className={`${smallBtn} w-full mt-2 bg-white/10 hover:bg-white/20 text-white border-white/20`}
        >
          <i className="fas fa-play"></i> آواز کی جانچ کریں
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-white/40">
          فون میں اردو آواز موجود ہو تو خودکار منتخب ہو جاتی ہے؛ نہ ہو تو لہجہ انگریزی ہو سکتا ہے۔
        </p>
      </div>

      {/* Monthly report: PDF (print) and real Excel */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-file-export text-rose-300 ml-1"></i> رپورٹ ڈاؤن لوڈ
        </h3>
        <p className="text-[11px] leading-5 text-white/45 mb-2">
          موجودہ مہینے ({formatMonthName(activeMonth)}) کا خلاصہ، اخراجات کی تقسیم، کھاتے اور
          ہر اندراج۔ PDF کے لیے پرنٹ ڈائیلاگ میں «Save as PDF» منتخب کریں۔
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportReportPdf}
            className={`${smallBtn} flex-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border-rose-500/40`}
          >
            <i className="fas fa-file-pdf"></i> PDF / پرنٹ
          </button>
          <button
            type="button"
            onClick={onExportReportExcel}
            className={`${smallBtn} flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-500/40`}
          >
            <i className="fas fa-file-excel"></i> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className={`${smallBtn} bg-white/10 hover:bg-white/20 text-white border-white/20`}
          >
            <i className="fas fa-file-csv"></i> CSV
          </button>
        </div>
      </div>

      {/* Brand, link preview and share */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-share-nodes text-sky-300 ml-1"></i> برانڈ اور واٹس ایپ پری ویو
        </h3>
        <ShareCard />
      </div>

      {/* Support & field diagnostics */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-headset text-[#25D366] ml-1"></i> مدد اور تشخیص
        </h3>
        {supportUrl().configured ? (
          <a
            href={supportUrl("مدد").url}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("support_open", { source: "settings" })}
            className={`${smallBtn} w-full justify-center bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border-[#25D366]/40 no-underline`}
          >
            <i className="fab fa-whatsapp text-base"></i> واٹس ایپ پر مدد لیں
          </a>
        ) : (
          <p className="text-[11px] leading-5 text-white/45">
            سیدھی واٹس ایپ مدد کے لیے <span className="font-sans">VITE_SUPPORT_WHATSAPP</span> سیٹ
            کریں — تب یہاں اور نیچے تیرنے والا بٹن نظر آئے گا۔
          </p>
        )}
        <p className="mt-2 font-sans text-[10px] text-white/35">
          {BRAND.name} · ورژن {BRAND.version}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onExportDiagnostics}
            className={`${smallBtn} flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20`}
          >
            <i className="fas fa-clipboard-list"></i> تشخیصی رپورٹ
          </button>
          <button
            type="button"
            onClick={onClearDiagnostics}
            className={`${smallBtn} bg-white/5 hover:bg-white/10 text-white/60 border-white/15`}
          >
            لاگ صاف
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-5 text-white/35">
          رپورٹ میں صرف فیچر کے استعمال کی گنتی اور ڈیوائس کی قسم ہوتی ہے — رقم، نام یا تفصیل نہیں۔
        </p>
      </div>

      {/* Staff PIN & salesman mode */}
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white/85 mb-2">
          <i className="fas fa-user-shield text-amber-300 ml-1"></i> PIN اور سیلز مین موڈ
        </h3>
        <p className="text-[11px] text-white/45 mb-2">
          سیلز مین موڈ میں سیٹنگز، CSV بیک اپ اور حذف کے بٹن چھپ جاتے ہیں — مالک موڈ میں واپس
          آنے کے لیے PIN درکار ہوگا۔
        </p>
        {hasPin ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => onOpenPin("set")}
                className={`${smallBtn} flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20`}
              >
                <i className="fas fa-key"></i> PIN تبدیل کریں
              </button>
              <button
                onClick={() => onOpenPin("remove")}
                className={`${smallBtn} flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20`}
              >
                <i className="fas fa-unlock"></i> PIN ہٹائیں
              </button>
            </div>
            <button
              onClick={onLockSalesman}
              className={`${smallBtn} w-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40`}
            >
              🔒 سیلز مین موڈ آن کریں
            </button>
          </div>
        ) : (
          <button
            onClick={() => onOpenPin("set")}
            className={`${smallBtn} w-full bg-white/10 hover:bg-white/20 text-white border-white/20`}
          >
            <i className="fas fa-lock"></i> PIN سیٹ کریں
          </button>
        )}
        {staffError && !pinOpen && (
          <p className="text-[11px] text-rose-300 mt-2">{staffError}</p>
        )}
      </div>

      <ConfirmDialog
        open={uploadConfirmOpen}
        onOpenChange={setUploadConfirmOpen}
        title="کلاؤڈ اپ لوڈ جانچ کریں"
        description="یہ آپ کے موجودہ مقامی ریکارڈوں کو کلاؤڈ والے حصے کے ساتھ ہم آہنگ کرے گا۔ اگر کلاؤڈ پر جدید ڈیٹا موجود ہے تو پہلے ڈاؤن لوڈ کریں۔"
        actionLabel="اپ لوڈ کریں"
        onConfirm={onConfirmUpload}
        variant="default"
        loading={syncBusy}
      />
    </Modal>
  );
}
