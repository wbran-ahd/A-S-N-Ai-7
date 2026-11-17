/**
 * i18n layer.
 *
 * Every visible string used to be hard-coded inline, which made a second
 * language a whole-app rewrite. Strings now live in one catalogue; `t()` is a
 * plain function (not a hook) so it is safe anywhere, including inside the
 * speech engine and canvas effects.
 *
 * The catalogue values are byte-identical to the previous inline strings, so
 * the rendered Urdu is unchanged.
 */

const ur = {
  /* header */
  wakeWordStatus: "آواز ایکٹو",
  spectralGrid: "اسپیکٹرل گرڈ",
  assistantName: "صوتی بقیہ (پرو اسسٹنٹ)",
  voiceActiveHint: '"اے منشی" وائس ایکٹیو →',
  csvBackup: "CSV بیک اپ",

  /* quick actions */
  advice: "مشورہ",
  charts: "چارٹس",
  thinking: "…",

  /* metric boxes */
  totalIncome: "کل رقم",
  totalExpense: "خرچہ",
  balance: "بقایا",
  openNotepad: "نوٹ پیڈ کھولیں →",
  currentMonth: "موجودہ مہینہ",
  archivedMonth: "آرکائیو شدہ ریکارڈ",

  /* transcript */
  /* Plain text on purpose: this string is rendered as text under the mic, so
     HTML tags here used to appear literally on screen. The bold wake word in
     the transcript is JSX (see `use-voice-assistant`). */
  micIdle: 'بولیں "اے منشی" یا مائیک دبائیں...',
  micExample: '💡 مثال: "500 روپے ایڈ کر لو" یا "مالیاتی مشورہ دو"',
  micListening: "منشی سن رہا ہے... فرمائیے!",
  micError: "آواز واضح نہیں آئی، دوبارہ کوشش کریں۔",
  micUnsupported: "یہ براؤزر آواز کی سہولت نہیں دیتا۔ برائے مہربانی Chrome استعمال کریں۔",

  /* actions */
  undoLast: "↩ آخری انٹری منسوخ کریں",
  undoEmpty: "منسوخ کرنے کے لیے کوئی انٹری موجود نہیں ہے۔",
  undoDone: "آخری انٹری منسوخ کر دی گئی۔",

  /* notepad modal */
  search: "تلاش کریں…",
  allCategories: "تمام اقسام",
  newEntry: "نئی",
  amountLabel: "رقم",
  detailLabel: "تفصیل",
  detailOptional: "تفصیل (اختیاری)",
  save: "محفوظ کریں",
  cancel: "منسوخ",
  edit: "ترمیم",
  delete: "حذف کریں",
  add: "شامل کریں",
  emptyList: "کوئی انٹری موجود نہیں ہے۔",
  noResults: "کوئی ممکنہ انٹری نہیں ملی۔",
  whatsappShare: "اس مہینے کی رپورٹ واٹس ایپ پر شیئر کریں",
  openingBalance: "آغاز بیلنس • پچھلا مہینہ",
  openingBalanceDetail: "📒 تفصیل: پچھلے مہینے سے منتقل ہونے والا بقایا کیش",
  detailPrefix: "📝 تفصیل:",

  /* confirm flow */
  confirmYes: "✓ ہاں، درج کریں",
  confirmNo: "✕ نہیں",
  sayYesOrNo: 'بولیں "ہاں" یا "نہیں" — یا نیچے کلک کریں',
  onlyYesOrNo: '"ہاں" یا "نہیں" میں سے ایک بولیں۔',
  entryRejected: "درج رد کر دی گئی۔",

  /* analytics modal */
  analyticsTitle: "ماہانہ خرچ و آمدنی کا گراف",
  trendTitle: "پچھلے 6 ماہ کا رجحان",
  categoryTitle: "قسم وار خرچہ",
  aiAnalyze: "🤖 اے آئی سے تجزیہ کروائیں",
  aiRunning: "تجزیہ تیار ہو رہا ہے…",

  /* settings modal */
  settingsTitle: "جیمینی اے آئی سیٹنگز",
  saveSettings: "سیو کریں",

  /* The key never leaves this device: it is read only by the browser's own
     Gemini request. No Firestore copy, no server copy. */
  geminiKeyIntro:
    "یہ key صرف اسی ڈیوائس پر محفوظ ہوتی ہے (کلاؤڈ پر نہیں جاتی)؛ تجزیہ اسی key سے براہ راست Gemini پر چلتا ہے، اس لیے کسی سے شیئر نہ کریں:",
  aiKeySaved: "اے آئی کی محفوظ ہو گئی۔",
  aiKeySaveFailed: "اے آئی کی محفوظ نہیں ہو سکی — دوبارہ کوشش کریں۔",
  aiKeyNeedsConnection: "اے آئی کی اس ڈیوائس پر محفوظ ہونے کے لیے براؤزر کی اسٹوریج دستیاب ہونی چاہیے۔",
  aiKeySavedVoice: "اے آئی کی محفوظ ہو گئی ہے۔",
} as const;

export type MessageKey = keyof typeof ur;

/** Language switch point — add a catalogue here and it becomes selectable. */
const catalogues: Record<string, Record<MessageKey, string>> = { ur };

let activeLocale = "ur";

export function setLocale(locale: string) {
  if (catalogues[locale]) activeLocale = locale;
}

export function t(key: MessageKey): string {
  return catalogues[activeLocale]?.[key] ?? ur[key] ?? key;
}

/** The catalogue, exposed so a language picker can render the options. */
export const availableLocales = Object.keys(catalogues);

/**
 * Every message key.
 *
 * Exported so a verification script can assert that no catalogue string
 * carries HTML: these values are rendered as text, so a tag here appears
 * literally on screen (that is exactly how `micIdle` shipped `<strong>` to
 * users until the live run caught it).
 */
export const messageKeys = Object.keys(ur) as MessageKey[];
