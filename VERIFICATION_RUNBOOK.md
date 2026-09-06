# مشتريات مسار — مسار التحقق القابل للتشغيل

هذه الوثيقة لا تنشر ولا تتصل بقاعدة الإنتاج. Preview الحالي غير صالح للاختبار ما دام `DATABASE_URL` يشير إلى Supabase الإنتاج.

## الخيار الأبسط

استخدم workflow اليدوي `.github/workflows/purchase-verification.yml` بعد السماح لاحقاً بدفع فرع التحقق. لا يحتوي workflow على خطوة نشر ولا يستعمل أسرار إنتاج، ويشغّل PostgreSQL 17 مؤقتاً داخل GitHub Actions.

### أول مهمة: إصلاح package-lock بطريقة صحيحة

`package.json` يتضمن `pdf-lib@^1.17.1` بينما lockfile الحالي أقدم. في أول تشغيل للـworkflow:

1. `npm install --package-lock-only --ignore-scripts`
2. يرفع `package-lock.json` الناتج كـartifact باسم `verified-package-lock`.
3. `npm ci --ignore-scripts` يثبت من نفس lockfile المولد للتأكد من صلاحيته.

بعد نجاح التشغيل، نزّل artifact واعتمد **ذلك** `package-lock.json` محلياً، راجع diff، ثم شغّل `npm ci` مرة أخرى في بيئة الشبكة قبل أي Preview. لا تعدّل integrity hashes يدوياً.

## قاعدة الاختبار

الـworkflow يستخدم PostgreSQL 17 مؤقتاً باسم `massar_purchase_verify`. ينشئ فقط دوري `anon` و`authenticated` اللازمين لمرور migrations التي تحتوي `REVOKE`. هذا يحاكي متطلبات SQL الأساسية ولا يثبت سلوك Supabase Auth/Data API بالكامل.

لا توجد أي خطوة `prisma migrate reset` أو `db push`. أمر الترحيل الوحيد هو:

```bash
npx prisma migrate deploy
```

ويعمل على `DATABASE_URL` المؤقت داخل job فقط.

## ترتيب التحقق

```bash
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx tsc --noEmit
node scripts/test-purchase-openai-static.cjs
node scripts/test-purchase-document-security.cjs
node scripts/test-purchase-receiving-phase4-static.cjs
node scripts/test-purchase-receiving-lifecycle.cjs
node scripts/test-purchase-legacy-cost-compat-static.cjs
npm run purchases:test
npm run purchases:document-test
npm run build
```

## ما لا يغطيه PostgreSQL المؤقت وحده

قبل Preview المعزول يلزم أيضاً اختبار migration على fixture اصطناعي يمثل **schema الإنتاج الفعلي**، بما فيه جداول `SupplierInvoice` القديمة ومرفقاتها، لا schema الـbase فقط. لا تنسخ بيانات عملاء من الإنتاج؛ استخدم DDL/بيانات اصطناعية فقط.

## توافق التكلفة المجهولة

الأصناف القديمة ذات `unitCost = NULL` لا تُمنع من البيع أو الاستهلاك في الصيانة أو تسجيل التالف أو تعديل الكمية بالمسارات القديمة لمجرد إضافة المشتريات. الحركة تحتفظ بـ`NULL` حيث كان السلوك القديم يسمح بذلك، ولا يتم اختراع صفر في طبقة المشتريات الجديدة.

المنع الجديد يقتصر على **استلام تكلفة-bearing جديد يحتاج حساب متوسط مرجح** عندما يوجد رصيد موجب وتكلفته الحالية مجهولة. إذا كان الرصيد صفراً، تكلفة الاستلام الجديد تصبح المتوسط. الإضافة اليدوية القديمة التي لا تحمل تكلفة لا تحاول حساب متوسط جديد وتبقي التكلفة الحالية كما هي، حتى لو كانت `NULL`.

ملاحظة: منطق الصيانة القديم يحوّل `NULL` إلى صفر في بعض حسابات إجمالي تكلفة التذكرة؛ هذا سلوك legacy سابق لهذه التوسعة ولم يتم تغييره ضمن إغلاق العمل الحالي.

## OpenAI PDF detail

`PURCHASE_AI_PDF_DETAIL` ينتقل فعلياً إلى حقل `detail` في عنصر `input_file` للـResponses API. القيم المسموحة محلياً `auto|low|high`. لا يوجد fallback تلقائي إلى نموذج أغلى.

## Preview build-only safety

على فرع `preview/purchase-receiving` يمنع `lib/prisma.ts` اتصال Vercel Preview بقاعدة المشروع افتراضياً.
لا يتم السماح بالاتصال إلا إذا كانت قاعدة Preview معزولة ثم ضُبط `MASSAR_ALLOW_PREVIEW_DATABASE=true` في Preview فقط.
بدون هذا المتغير يمكن استخدام Preview للتحقق من البناء، لكن الصفحات التي تحتاج قاعدة بيانات ستفشل في الاتصال عمداً ولا يجوز اعتبار ذلك اختباراً وظيفياً للمشتريات.
