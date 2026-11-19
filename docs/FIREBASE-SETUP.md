# Firebase سیٹ اپ گائیڈ — صوتی بقیہ

یہ گائیڈ **آپ کے لیے** ہے: صرف Firebase Console اور CLI کے وہ کام جو ایپ چلانے کے
لیے درکار ہیں۔ کوڈ، `firebase.json`، `.firebaserc` اور rules پہلے سے تیار ہیں۔

|                 |                                                                 |
| --------------- | --------------------------------------------------------------- |
| **Project ID**  | `gen-lang-client-09792501-d8895`                                |
| **authDomain**  | `gen-lang-client-09792501-d8895.firebaseapp.com`                |
| **Hosting**     | `https://gen-lang-client-09792501-d8895.web.app`                |
| **AI function** | `analyze` — region `us-central1` (اختیاری)                      |
| **کل وقت**      | تقریباً 10 منٹ (پہلی deploy 5–10 منٹ اضافی)                     |

> ایکٹیویشن، لائسنسنگ، `/activate`، `/admin`، Email/Password لاگ اِن اور
> `ACTIVATION_PEPPER` سب ختم ہو چکے ہیں۔ اُن کا کوئی step یا کمانڈ نہ چلائیں — وہ
> اب موجود ہی نہیں۔ ایپ `/` پر سیدھی کھاتی ہے اور پیچھے پردہ **anonymous Firebase
> Auth** استعمال کرتی ہے، تاکہ Firestore rules کام کریں۔

---

## 0. پہلے یہ پڑھیں

### 4 چیزیں جو کبھی نہ کریں

1. **`firebase init` نہ چلائیں** — یہ موجودہ `firebase.json`، `.firebaserc` اور
   `functions/` کو اوور رائٹ کر دے گا۔
2. **Anonymous provider بند نہ کریں** — ایپ اسی خاموش شناخت پر چلتی ہے۔ بند کرنے سے
   کلاؤڈ سینک رک جائے گا اور صارف کو کوئی لاگ اِن سکرین نظر نہیں آئے گی۔
3. **Service-account JSON کسی کو نہ بھیجیں اور نہ commit کریں** — وہ سارے Firestore
   rules بائی پاس کر سکتی ہے۔
4. **Firestore database کی location نہ بدلیں اور نہ delete کریں** — location بعد میں
   تبدیل نہیں ہو سکتی۔

### 2 چیزیں جو اختیاری ہیں

- **Blaze plan** صرف AI function کے لیے چاہیے۔ بغیر اُس کے کھاتہ، سینک، بیک اپ اور
  CSV سب چلتے رہتے ہیں؛ «مشورہ» مقامی خلاصہ دکھا دیتا ہے۔
- **ای میل کا اردو template** — خوبصورتی کے لیے، لازمی نہیں۔

---

## 1. Firebase Console کھولیں

1. https://console.firebase.google.com کھولیں۔
2. Project selector سے **`gen-lang-client-09792501-d8895`** منتخب کریں۔
3. براہ راست لنک:
   `https://console.firebase.google.com/project/gen-lang-client-09792501-d8895/overview`

**تصدیق:** Overview پر project ID بالکل وہی نظر آئے۔

---

## 2. Authentication — دو providers

لنک:
`https://console.firebase.google.com/project/gen-lang-client-09792501-d8895/authentication/providers`

### 2.1 Anonymous (پہلے سے on — صرف چیک کریں)

- **Anonymous** قطار میں **Enabled** لکھا ہو۔ اگر Disabled ہے تو Enable → Save۔
- ہر صارف اسی anonymous identity سے داخل ہوتا ہے؛ یہی اُس کا `uid` بنتا ہے۔

### 2.2 Email link (passwordless sign-in) — نیا فائدہ

- **Email link (passwordless sign-in)** → **Enable** → **Save**۔
- نئے Console میں یہ **Sign-in providers** کے نیچے ہوتا ہے؛ نہ ملے تو
  **Add new provider** → یہی آپشن۔
- **Email/Password** کی ضرورت نہیں — اُسے نہ چھیڑیں۔

یہی وہ سہولت ہے جس سے پرانا کھاتہ نئے فون پر کھلتا ہے: موجودہ anonymous اکاؤنٹ ای میل
سے **لنک** ہوتا ہے، اسی `uid` پر، اور نئے فون پر وہی ای میل سائن اِن کر کے وہی
`users/{uid}` کھول دیتی ہے۔

**تصدیق:** دونوں قطاروں پر سبز **Enabled**۔

> اسے on کیے بغیر «ای میل لنک بھیجیں» `auth/operation-not-allowed` دے گا۔

---

## 3. Authorized domains

لنک:
`https://console.firebase.google.com/project/gen-lang-client-09792501-d8895/authentication/settings`

**Settings → Authorized domains** میں یہ ہوں:

| hostname | حالت |
| --- | --- |
| `localhost` | پہلے سے موجود — کمپیوٹر پر جانچ |
| `gen-lang-client-09792501-d8895.firebaseapp.com` | پہلے سے موجود |
| `gen-lang-client-09792501-d8895.web.app` | **Add domain** سے شامل کریں |
| اپنا custom domain | صرف تب، جب استعمال ہو رہا ہو |

- **Add domain** میں صرف hostname لکھیں: `https://` نہیں، آگے `/` نہیں۔
- Wildcard کام نہیں کرتا؛ ہر hostname الگ شامل کریں۔
- لنک `${origin}/?emailSignIn=1` پر واپس آتا ہے، اسی لیے یہ فہرست اہم ہے۔
- Preview/test کا hostname (مثلاً `pv-….style.dev`) ہر سیشن میں بدلتا ہے — اُس وقت
  کا اصل hostname شامل کریں۔

**تصدیق:** فہرست میں کم از کم `localhost` اور اپنا لائیو hostname نظر آئے۔

---

## 4. ای میل template (اختیاری)

لنک:
`https://console.firebase.google.com/project/gen-lang-client-09792501-d8895/authentication/emails`

1. **Templates → Email link sign-in** (پرانا نام: *Passwordless sign-in*)۔
2. **Subject** اور **Message body** اردو میں لکھیں۔
3. `%LINK%` placeholder نہ ہٹائیں — وہی اصل لنک ہے۔
4. Sender name/address default رہنے دیں (custom SMTP الگ سیٹ اپ ہے)۔
5. **Save**۔

---

## 5. Firestore database اور rules

لنک: `https://console.firebase.google.com/project/gen-lang-client-09792501-d8895/firestore`

### Database

- پہلے سے موجود ہو تو **Location** دیکھیں۔ اگر `asia-south1` نہیں ہے تو کچھ نہ کریں —
  location بعد میں تبدیل نہیں ہو سکتی؛ فرق صرف latency کا ہے۔
- نہ ہو تو **Create database** → Edition **Standard** → ID `(default)` → location
  **asia-south1** → mode **Production mode** → Create۔

### Rules (لازمی)

**Firestore Database → Rules** → repo کی `firestore.rules` کا پورا مواد پیسٹ کریں →
**Publish**۔ یا کمانڈ سے: `firebase deploy --only firestore:rules`۔

**تصدیق:** Rules tab میں وہی مواد نظر آئے، بالخصوص `users/{userId}` کے نیچے
`records`، `parties` اور `partyTxns` کی rules۔

> Rules publish نہ ہوں تو ایپ `Missing or insufficient permissions` دیتی ہے اور سینک
> خاموشی سے رک جاتا ہے۔

---

## 6. Hosting

لنک: `https://console.firebase.google.com/project/gen-lang-client-09792501-d8895/hosting`

1. **Get started** نظر آئے تو دبائیں — wizard کے steps صرف تعارفی ہیں، اصل upload
   CLI سے ہوتا ہے۔
2. Default site `gen-lang-client-09792501-d8895` ہوگا۔
3. Custom domain ابھی **نہ** جوڑیں — پہلے `.web.app` URL پر سب چلنے دیں (اور اُسے
   مرحلہ 3 میں Authorized domains میں شامل کریں)۔

**تصدیق:** Hosting صفحہ کھلے؛ «Not deployed» لکھا ہو تو بھی نارمل ہے۔

---

## 7. Blaze + بجٹ الرٹ (صرف AI function کے لیے)

Functions چاہیے ہوں تو:

1. ⚙️ **Project settings → Usage and billing → Modify plan → Blaze**، billing account
   شامل کریں۔
2. بجٹ: https://console.cloud.google.com/billing/budgets → **Create budget** →
   `sauti-monthly` → **$1** → alerts 50/90/100% → اپنا email۔

> بجٹ الرٹ صرف خبر دیتا ہے، روکتا نہیں۔ AI function نہ چاہیے تو یہ مرحلہ چھوڑ دیں۔

---

## 8. اپنے کمپیوٹر پر CLI

```bash
node -v                 # 20 سے اوپر کوئی بھی موجودہ LTS
npm install -g firebase-tools
firebase login          # اپنے Google اکاؤنٹ سے Allow
firebase projects:list  # فہرست میں gen-lang-client-09792501-d8895 نظر آئے
```

پروجیکٹ فولڈر میں:

```bash
cd path/to/sauti-baqaya
firebase use gen-lang-client-09792501-d8895   # .firebaserc پہلے سے موجود ہے
firebase use                                  # تصدیق
```

---

## 9. Deploy

```bash
# فرانت
bun install
bun run typecheck
bun run build

# rules پہلے، پھر ویب سائٹ
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

اگلی بار ایک کمانڈ: `bun run build && firebase deploy --only hosting,firestore:rules`

### AI function (اختیاری)

```bash
printf 'ZAI_API_KEY=%s\n' 'اپنی-چابی' > functions/.env   # یہ فائل git میں نہیں جاتی
firebase deploy --only functions
```

- پہلی بار CLI کچھ APIs enable کرنے کی اجازت مانگے گا (Cloud Build, Artifact Registry,
  Cloud Run, Eventarc) — **Yes**۔ 5–10 منٹ لگ سکتے ہیں۔
- چابی code میں نہ لکھیں، نہ چیٹ میں بھیجیں؛ صرف `functions/.env` میں رکھیں۔
- کلائنٹ اسی function کو region `us-central1` پر بلاتا ہے — region بدلنے کے لیے
  `functions/index.js` اور `src/lib/ai.ts` دونوں میں بدلنا پڑے گا۔

**تصدیق:** Console → Functions میں `analyze` نظر آئے؛ ایپ میں **مشورہ** دبانے پر جواب
آئے۔

---

## 10. ڈیپلائے کے بعد چیک لسٹ

| # | کیا دیکھیں | متوقع |
| --- | --- | --- |
| 1 | Hosting URL (`https://gen-lang-client-09792501-d8895.web.app`) | ایپ کھلے |
| 2 | کھاتہ: ایک خرچہ درج کریں | فوراً محفوظ ہو، «کلاؤڈ پر محفوظ» آئے |
| 3 | Console → Authentication → Users | ایک نیا **anonymous** صارف |
| 4 | Settings → «کھاتہ محفوظ کریں» | لنک بھیجے، email آئے، لنک کھلنے پر «کھاتہ ای میل سے محفوظ ہو گیا» |
| 5 | Console → Authentication → Users | وہی صارف اب email کے ساتھ، **uid وہی** |
| 6 | Console → Firestore → Rules | published rules نظر آئیں |
| 7 | DevTools → Console | کوئی سرخ error نہ ہو |
| 8 | (AI چاہیے تو) Functions | `analyze` موجود |

> `/activate` اور `/admin` اب موجود نہیں — اُن کے 404 پر پریشان نہ ہوں۔

---

## 11. مسائل اور حل

| علامت | وجہ | حل |
| --- | --- | --- |
| «ای میل لنک سہولت ابھی Firebase میں فعال نہیں» (`auth/operation-not-allowed`) | Email link provider off | مرحلہ 2.2 |
| `auth/unauthorized-continue-uri` | domain authorized نہیں | مرحلہ 3 |
| `auth/expired-action-code` | لنک پرانا | نیا لنک بھیجیں |
| `auth/invalid-action-code` | لنک استعمال ہو چکا یا دوسرے براؤزر میں کھلا | نیا لنک، **اسی** براؤزر میں |
| `auth/too-many-requests` | بہت کوششیں | چند منٹ بعد |
| `Missing or insufficient permissions` | rules publish نہیں ہوئے | مرحلہ 5 |
| `The query requires an index` | index نہیں بنا | پیغام کے لنک پر کلک، یا `firebase deploy --only firestore:indexes` |
| Hosting پر deep link 404 | SPA rewrite غائب | `firebase.json` کا rewrite چیک کریں، hosting دوبارہ deploy |
| `Your project must be on the Blaze plan` | Functions/secrets | صرف AI کے لیے مرحلہ 7 |
| Functions deploy پر Node runtime decommission error | `nodejs20` ریٹائر ہو چکا | `firebase.json` میں runtime `nodejs22` کریں **اور** `functions/package.json` کے `engines.node` بھی `22`، پھر deploy |
| `firebase login` permission error | پرانا token | `firebase login --reauth` |
| AI پر «اے آئی دستیاب نہیں» | `functions/.env` میں چابی نہیں | مرحلہ 9 (AI)، پھر deploy |

مزید: [`RUNBOOK.md`](RUNBOOK.md) (بحالی، چابی بدلنا، گمشدہ فون) اور
[`DEPLOY.md`](DEPLOY.md) (ڈیپلائے کے راستے)۔
