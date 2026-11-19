# ADR 001 — ایک ہی بیک اینڈ: Firebase

**حالت:** نافذ (Convex مکمل طور پر ہٹا دیا گیا)
**تاریخ:** 16 نومبر 2026

## سیاق و سباق

ایپ ایک عرصے تک دو بیک اینڈ رکھتی تھی: Firestore (کھاتہ، پارٹیاں، سیٹنگز) اور Convex
(تصدیق، AI cache، روزانہ quota، Vapi کال)۔ دو "سچ" بن گئے تھے:

- ایک ہی قسم کا optimistic-concurrency ٹوکن (`syncState`) دو جگہ متعین تھا؛
- AI کی حد Convex میں تھی مگر کلائنٹ کا خیال تھا کہ وہ Firestore میں ہے؛
- Convex کا کلائنٹ راستہ کبھی مکمل نہیں ہوا: `useAiAdvisor` دراصل مقامی خلاصہ دیتا
  تھا، یعنی سرور کا AI راستہ استعمال ہی نہیں ہو رہا تھا؛
- ہر نئی خصوصیت کے لیے فیصلہ کرنا پڑتا تھا کہ کس بیک اینڈ میں جائے گی۔

## فیصلہ

**Firebase واحد بیک اینڈ ہے۔**

| ضرورت | حل |
|---|---|
| ڈیٹا (کھاتہ، پارٹیاں، سیٹنگز، quota، AI cache) | Firestore، `users/{uid}` کے نیچے |
| تصدیق | Firebase Anonymous Auth (خاموش سیشن) |
| سرور سائیڈ AI | Firebase Cloud Function `analyze` (`functions/index.js`) |
| اصول و تحفظ | `firestore.rules` |

Convex کا تمام کوڈ، اسکیما، کنفیگ اور dependency ہٹا دیے گئے۔ Vapi کا نامکمل
انضمام بھی ہٹا دیا گیا (اس کا کلائنٹ کبھی کسی اسکرین پر نہیں لگا تھا)۔

## نتائج

**فائدے**

- ایک ہی جگہ ڈیٹا، ایک ہی قوانین، ایک ہی quota کا ذریعہ۔
- سرور کی چابی Cloud Functions کے environment میں رہتی ہے، فون تک نہیں پہنچتی۔
- npm dependency درخت چھوٹا؛ `convex` اور `@convex-dev/auth` غائب۔

**قیمت**

- AI کے لیے Cloud Functions ڈیپلائے کرنا لازم ہے
  (`firebase deploy --only functions`)؛، ورنہ ایپ مقامی خلاصہ دکھاتی ہے — یہ
  واضح طور پر "مقامی" لکھا جاتا ہے، چھپایا نہیں جاتا۔
- Firestore میں لین دین (transactions) محدود ہیں: اسی لیے upload منصوبہ
  (`planUpload`) اور tombstone اصول ہر تحریر سے پہلے فیصلہ کرتے ہیں۔

## نافذ کرنے کا طریقہ

1. `functions/.env` میں `ZAI_API_KEY` یا `GEMINI_API_KEY` سیٹ کریں۔
2. `firebase deploy --only functions`۔
3. ایپ میں **مشورہ** دبائیں؛ جواب آنا تصدیق ہے۔
4. تفصیل: `docs/RUNBOOK.md`۔
