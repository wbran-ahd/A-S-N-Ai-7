# ڈیپلائے گائیڈ — صوتی بقیہ کو لائیو کریں

## 🔒 سورس میپ (source map) — کبھی عوامی نہیں

`vite` پروڈکشن بلڈ میں `sourcemap: 'hidden'` ہے، یعنی ہر `.js` کے ساتھ ایک `.js.map`
`dist/` میں بنتا ہے۔ وہ میپ **کبھی شائع نہیں ہوتے**:

- `bun run build` کے آخر میں `scripts/finalize-dist.mjs` چلتا ہے؛ اگر
  `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` موجود ہوں تو میپ **Sentry** پر
  اپ لوڈ ہوتے ہیں (اسی release کے ساتھ جو ایپ بھیجتی ہے)، اور پھر **تمام `.map` فائلیں
  ڈیلیٹ** کر دی جاتی ہیں۔
- `bun run verify:nomaps` ایک سخت گیٹ ہے: `dist/` میں ایک بھی `.map` ملے تو exit code 1۔
  یہ `ci.yml` اور `deploy.yml` دونوں میں بلڈ کے فوراً بعد چلتا ہے۔
- `firebase.json` میں `**/*.map` کا ignore بھی موجود ہے (دوسری حفاظتی تہہ)۔

Sentry کے secrets (اختیاری): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`۔
ان کے بغیر میپ صرف ڈیلیٹ ہو جاتے ہیں — ڈیپلائے نہیں رکتا۔

---

## کیا ڈیپلائے ہوتا ہے

| چیز | کمانڈ | لازمی؟ |
| --- | --- | --- |
| ویب ایپ (Hosting، SPA) | `firebase deploy --only hosting` | ✅ ہاں |
| Firestore rules | `firebase deploy --only firestore:rules` | ✅ ہاں (جب rules بدلیں) |
| Firestore indexes | `firebase deploy --only firestore:indexes` | صرف نئے index پر |
| AI function `analyze` | `firebase deploy --only functions` | اختیاری |

> ایکٹیویشن، لائسنسنگ، `/activate`، `/admin`، Email/Password اور
> `ACTIVATION_PEPPER` **ختم** ہو چکے ہیں۔ پرانی گائیڈز کے وہ کمانڈز نہ چلائیں — وہ
> اب کچھ ڈیپلائے نہیں کریں گے، صرف الجھن دیں گے۔

**کل وقت:** پہلی بار 5–10 منٹ، اس کے بعد ہر اپ ڈیٹ 1–2 منٹ۔
**کیا تیار ہے:** سارا code، `firebase.json`، `.firebaserc`، rules، indexes۔

---

## 0. پہلے تصدیق — سب تیار ہے؟

| # | چیز | حالت |
| --- | --- | --- |
| 1 | فرانت اِند بلڈ (`bun run build`) | ✅ `dist/` (میپ کے بغیر) |
| 2 | Hosting فولڈر — `firebase.json` میں `"public": "dist"` | ✅ |
| 3 | پروجیکٹ — `.firebaserc` میں `gen-lang-client-09792501-d8895` | ✅ |
| 4 | Rules + indexes فائلیں | ✅ `firestore.rules`, `firestore.indexes.json` |
| 5 | Email link + Authorized domains | ⚠️ **آپ** — [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) مرحلہ 2–3 |
| 6 | Blaze (صرف AI) | ⚠️ **آپ** — `FIREBASE-SETUP.md` مرحلہ 7 |

---

## قدم 1 — Terminal کھولیں

- **Windows:** Start میں `cmd` یا `PowerShell`۔
- **Mac:** `Terminal`۔
- پروجیکٹ کے فولڈر میں جائیں (وہاں `firebase.json` ہو):

```bash
cd path/to/sauti-baqaya
```

---

## قدم 2 — Firebase سے لاگ اِن

```bash
firebase login
```

براؤزر کھلے گا → **Allow**۔ CLI نہ ہو تو پہلے: `npm install -g firebase-tools`۔

تصدیق:

```bash
firebase projects:list
```

فہرست میں `gen-lang-client-09792501-d8895` نظر آنا چاہیے۔

---

## قدم 3 — پروجیکٹ منتخب کریں

```bash
firebase use
```

آؤٹ پوٹ میں `gen-lang-client-09792501-d8895` آئے۔ نہ آئے تو:

```bash
firebase use gen-lang-client-09792501-d8895
```

---

## قدم 4 — Rules اور Indexes

### 4.1 Rules (پہلے یہی)

```bash
firebase deploy --only firestore:rules
```

یہ `firestore.rules` سرور پر لگاتا ہے — یہی طے کرتا ہے کہ ہر صارف صرف اپنا
`users/{uid}` پڑھ/لکھ سکے۔ نئے rules کے بغیر سینک permission errors دیتا ہے۔

### 4.2 Indexes (جب پیغام آئے)

```bash
firebase deploy --only firestore:indexes
```

Composite index بننے میں 1–2 منٹ لگ سکتے ہیں۔ بغیر اِس کے کچھ queries
`The query requires an index` دیتی ہیں۔

> دونوں ایک ساتھ: `firebase deploy --only firestore`

---

## قدم 5 — ویب ایپ (Hosting)

```bash
bun install
bun run typecheck
bun run build
firebase deploy --only hosting
```

`bun run build` پہلے TypeScript چیک کرتا ہے، پھر `dist/` بناتا ہے (اور `.map` ہٹاتا
ہے)، پھر Hosting وہی `dist/` اپ لوڈ کرتا ہے۔ SPA rewrite کی وجہ سے deep links 404
نہیں دیتے۔

ختم ہونے پر لنک ملے گا:

```
https://gen-lang-client-09792501-d8895.web.app
```

---

## قدم 6 — AI function (اختیاری)

```bash
printf 'ZAI_API_KEY=%s\n' 'اپنی-چابی' > functions/.env    # git میں نہیں جاتی
firebase deploy --only functions
```

- function کا نام `analyze`، region `us-central1` — کلائنٹ بھی وہیں سے بلاتا ہے۔
- پہلی بار CLI کچھ APIs enable کرنے کی اجازت مانگے گا (Cloud Build, Artifact Registry,
  Cloud Run, Eventarc) — **Yes**۔
- چابی کبھی code، commit یا چیٹ میں نہ رکھیں۔ بدلنی ہو تو `functions/.env` اپ ڈیٹ
  کریں، دوبارہ deploy کریں، اور پرانی چابی فراہم کنندہ کے ڈیش بورڈ سے منسوخ کریں
  (تفصیل `RUNBOOK.md` مرحلہ 4)۔
- Function نہ ہو تو ایپ «مشورہ» پر واضح **مقامی** خلاصہ دکھاتی ہے — یہ خرابی نہیں۔

---

## قدم 7 — ڈیپلائے کے بعد چیک لسٹ

| # | کیا کریں | متوقع |
| --- | --- | --- |
| 1 | لائیو URL کھولیں | ایپ کھلے، پہلی سکرین Urdu |
| 2 | ایک خرچہ درج کریں | فوراً محفوظ، «کلاؤڈ پر محفوظ» |
| 3 | Settings → «کھاتہ محفوظ کریں» | email لکھیں → لنک آئے → لنک کھلے → «کھاتہ ای میل سے محفوظ ہو گیا» |
| 4 | Console → Authentication → Users | anonymous صارف (اور لنک کے بعد وہی uid email کے ساتھ) |
| 5 | Console → Firestore → Rules | published rules |
| 6 | Console → Firestore → Data | `users/{uid}/records` میں اندراج |
| 7 | (AI ہو تو) Console → Functions | `analyze` |
| 8 | DevTools → Console | کوئی سرخ error نہیں |

---

## اگلی بار صرف ایک کمانڈ

```bash
bun run build && firebase deploy --only hosting,firestore:rules
```

---

## 📱 موبائل سے ایک ٹیپ ڈیپلائے (GitHub Actions)

کمپیوٹر کی ضرورت نہیں؛ GitHub موبائل ایپ سے چلائیں۔

### ایک بار کی تیاری

1. GitHub → ریپو → **Settings → Secrets and variables → Actions**۔
2. **New repository secret** → نام: `FIREBASE_SERVICE_ACCOUNT` → ویلیو: Firebase
   Console → ⚙️ Project settings → Service accounts → **Generate new private key**
   سے ملی JSON کا پورا مواد۔
3. (اختیاری، source maps کے لیے) `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
   `SENTRY_PROJECT`۔

> 🔴 service-account JSON نہ commit کریں، نہ کسی کو بھیجیں — یہ سارے rules بائی پاس
> کرتی ہے۔ صرف GitHub secrets میں رہے۔

### ڈیپلائے

1. GitHub ایپ → **Actions** → **Deploy to Firebase** → **Run workflow**۔
2. `targets` چنیں:
   - `hosting-and-rules` — ڈیفالٹ (UI + rules)
   - `hosting-only` — صرف UI
   - `rules-only` — صرف rules
   - `everything` — rules + indexes + hosting (احتیاط: indexes فائل سے باہر والے
     delete ہو سکتے ہیں)
3. **Run workflow** → تقریباً 3–5 منٹ۔

Workflow خود typecheck، ledger tests، frontend build اور `verify:nomaps` چلاتا ہے —
ٹوٹا یا میپ والا بلڈ لائیو نہیں جاتا۔ یہ صرف ہاتھ سے چلتا ہے، کسی push پر نہیں۔

---

## عمومی مسائل

| علامت | حل |
| --- | --- |
| `You are not logged in` | قدم 2 دوبارہ |
| `project is not a valid project` | قدم 3 |
| `Missing or insufficient permissions` | قدم 4.1 (rules deploy) |
| `The query requires an index` | قدم 4.2، یا error کے لنک پر کلک |
| Hosting پر deep link 404 | `firebase.json` کا SPA rewrite چیک کریں، قدم 5 دوبارہ |
| `auth/operation-not-allowed` (ای میل لنک) | `FIREBASE-SETUP.md` مرحلہ 2.2 |
| `auth/unauthorized-continue-uri` | `FIREBASE-SETUP.md` مرحلہ 3 (Authorized domains) |
| `Your project must be on the Blaze plan` | صرف AI کے لیے — `FIREBASE-SETUP.md` مرحلہ 7 |
| Functions پر Node runtime decommission error | `firebase.json` کا runtime `nodejs22` اور `functions/package.json` کا `engines.node` `22` کریں، پھر deploy |
| AI پر «اے آئی دستیاب نہیں» | `functions/.env` میں چابی سیٹ کریں، قدم 6 دوبارہ |

مزید: [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) (Console) اور
[`RUNBOOK.md`](RUNBOOK.md) (بحالی، چابی، گمشدہ فون)۔
