# Massar ERP — استلام بضاعة / Purchase Receiving

هذه الحزمة مبنية فوق `main` عند:

`c914203d8fdace27ae073c50cb4d6bf7c3b9b997`

ولا تتضمن أي `git push` أو نشر Vercel أو كتابة على قاعدة الإنتاج.

## المرحلة الأساسية الموجودة في الحزمة

- `PurchaseInvoice` / `PurchaseItem` / `PurchasePayment` منفصلة عن Invoice/Payment وديون العملاء.
- مسودة تلقائية بلا أثر مخزني أو مالي.
- مورد واحد للفاتورة، مع إنشاء سريع، وشراء نقدي غير مسجل فقط عند الدفع النقدي الكامل.
- بنود متعددة، أصناف موجودة وجديدة، وتحديث المخزون عند الاعتماد فقط.
- اعتماد ذري Serializable مع قفل الفاتورة ومنع إعادة الاعتماد.
- STOCK_IN مرتبط بالفاتورة والبند والمورد وتكلفة الشراء.
- الدفعة النقدية تخرج من الدرج داخل نفس معاملة الاعتماد.
- الفاتورة المعتمدة للقراءة فقط.
- `orderedQuantity` و`receivedQuantity` ممهدتان للاستلام الجزئي لاحقاً.

## إضافات هذه المرحلة

### 1. لصق Excel

الملفات:

- `lib/purchase-import.ts`
- `app/inventory/purchases/_purchase-import-panel.tsx`

التنفيذ:

- لصق Tab / CSV comma / semicolon مع معاينة قبل الإدخال.
- اكتشاف صف العناوين واقتراح mapping، مع اختيار المستخدم لأعمدة:
  - الاسم
  - الباركود/المعرف
  - الكمية
  - تكلفة الوحدة
  - سعر البيع الاختياري
- دعم الأرقام العربية والهندية/الفارسية، `٫` و`٬`، والنقط/الفواصل الإنجليزية.
- التنسيقات الغامضة مثل `1,234` لا تمر بصمت: تعرض مرشحين وتحذيراً، ويجب تأكيد المراجعة ويمكن تعديل الخلية في المعاينة.
- أخطاء على مستوى السطر.
- الصفوف الصحيحة تنتقل إلى نفس مسودة الشراء، والصفوف الخاطئة تبقى في لوحة الاستيراد للتصحيح.
- لا يوجد استدعاء اعتماد أو إنشاء InventoryItem من لوحة اللصق.
- النص الأصلي لكل صف محفوظ في `PurchaseItem.importedSourceText` للمراجعة.

### 2. مطابقة الأصناف

- الباركود exact أولاً، ثم SKU exact.
- المطابقة بالاسم اقتراح للمراجعة فقط، حتى إذا كان الاسم متطابقاً حرفياً.
- الحالات في الواجهة: `صنف موجود` / `صنف جديد` / `يحتاج مراجعة`.
- الجودة/اللون/الموديل المتشابهة لا تندمج بسبب الاسم.
- تكرار الباركود داخل اللصق يظهر تحذيراً ولا يدمج الصفوف.
- الاعتماد يرفض أي سطر بقي `matchReviewRequired=true`.

### 3. الباركود

الملف:

- `app/inventory/purchases/_barcode-scanner.tsx`

التنفيذ:

- وضع Scanner صريح لقارئ USB/Bluetooth الذي يعمل كلوحة مفاتيح.
- يستخدم توقيت ضغطات المفاتيح لتمييز المسح السريع عن الكتابة العادية.
- إذا كان الوضع غير مفعّل، Enter لا يعامل الكتابة كمسح تلقائي.
- صنف معروف:
  - يزيد كمية سطر نفس الصنف عندما تكون تكلفة السطر مطابقة لتكلفة المسح المقترحة.
  - عند وجود نفس الصنف بتكلفة مختلفة، تظهر خيارات صريحة: زيادة سطر تكلفة محدد أو إضافة سطر جديد.
- باركود غير معروف يفتح صنفاً جديداً داخل المسودة مع تعبئة الباركود.
- الكاميرا تظهر فقط عند وجود `BarcodeDetector` و`getUserMedia` فعلياً.
- رفض الإذن وعدم دعم المتصفح لهما رسالة واضحة، ولا يوجد زر كاميرا وهمي.

### 4. التصنيف والتوافقات

- الأصناف الجديدة يمكن اقتراح تصنيفها من تصنيفات/أصناف المتجر الموجودة.
- تطبيق تصنيف جماعي على البنود الجديدة المحددة فقط.
- اقتراح الموديلات يأتي عبر `/api/compatibility/directory` الموجود في المشروع.
- لا ينشأ أي `InventoryCompatibilityGroup` إلا بعد اختيار المستخدم نتيجة من دليل التوافقات.
- أصناف المخزون الموجودة لا تتغير توافقاتها في تدفق الشراء.
- خيار `إكمال التوافقات لاحقاً` يحفظ `InventoryItem.compatibilityReviewNeeded` عند إنشاء الصنف.
- صفحة المتابعة:
  - `/inventory/purchases/pending-compatibility`
- تعديل الصنف لاحقاً وإضافة توافق مؤكد من تدفق المخزون الحالي يزيل علامة المتابعة (ضمن patch لـ `inventoryService`).

### 5. مساعد التسعير

- للصنف الموجود تظهر:
  - آخر تكلفة STOCK_IN متاحة
  - تاريخها
  - المورد المرتبط بها
  - سعر البيع الحالي
  - فرق التكلفة الجديدة عنها
- إجراء جماعي باسم واضح: **زيادة على التكلفة**.
- نسبة يحددها المستخدم مع تقريب: بدون / 0.5 / 1 / 5.
- معاينة قبل التطبيق.
- ضغط "تطبيق المقترحات" يملأ الأسعار فقط؛ وللصنف الموجود يفعّل `updateSalePrice` صراحة.
- الاعتماد نفسه هو المكان الوحيد الذي يغير `InventoryItem.unitPrice`، وبصلاحية `inventory:manage`.
- يتم حفظ `salePriceBeforeSnapshot` للتدقيق.
- أساس الاقتراح هو `PurchaseItem.unitCost` فقط. الخصم والشحن لا يدخلان في أساس التسعير لأن النظام لا يملك حالياً سياسة توزيع landed cost؛ لم يتم اختراع سياسة بصمت.

### 6. استخدام فاتورة سابقة

- في تفاصيل فاتورة الشراء: `استخدام كمسودة جديدة`.
- ينسخ المورد والبنود.
- تاريخ المسودة الجديدة = وقت الإنشاء الحالي.
- لا ينسخ:
  - رقم فاتورة المورد السابق
  - المدفوع
  - Payment source/reference
  - PurchasePayment
  - InventoryMovement
- الخصم والمصاريف الإضافية تبدأ صفراً في المسودة الجديدة لضرورة مراجعة فاتورة المورد الجديدة.
- تظهر رسالة صريحة لمراجعة الكميات والتكاليف والأسعار.

## migrations

1. `prisma/migrations/20260906123000_add_purchase_receiving/migration.sql`
2. `prisma/migrations/20260906143000_purchase_receiving_import_barcode_pricing/migration.sql`

المigration الثانية تضيف:

- `InventoryItem.barcode`
- unique active barcode داخل المتجر الواحد
- `InventoryItem.compatibilityReviewNeeded`
- بيانات import/matching/category/compatibility/explicit pricing في `PurchaseItem`

**لم يتم تطبيق أي migration في هذه الجلسة.**

## patch للملفات الموجودة

`patches/existing-files.patch` يتضمن التغييرات المطلوبة في:

- `prisma/schema.prisma`
- `app/inventory/page.tsx`
- `components/app-nav.tsx`
- `lib/services/cashDrawerService.ts`
- `lib/cash-drawer-presentation.ts`
- `lib/services/inventoryService.ts`
- `package.json` لإضافة `purchases:test`

## نتائج التحقق المنفذ محلياً

### pure import/matching/pricing tests

تم تجميع `lib/purchase-import.ts` مباشرة بواسطة TypeScript وتشغيل harness بـ Node، وكانت النتيجة PASS لما يلي:

- لصق 20 صفاً: 20/20 صفاً محللاً.
- 20 اسماً عربياً محفوظاً.
- أرقام عربية مثل `٢` و`١٤٫٥` تحولت بصورة صحيحة.
- `١٬٢٣٤٫٥٠` = `1234.5`.
- `1.234,56` و`1,234.56` = `1234.56`.
- الصف الناقص في تكلفة الوحدة ينتج خطأ على نفس الصف.
- `1,234` يظهر كتنسيق غامض بمرشحين `1.234` و`1234`.
- باركود مكرر لا يدمج صف Original مع Copy.
- exact barcode => existing.
- الاسم وحده => review، بما في ذلك أصناف Original/Copy المتشابهة.
- زيادة على التكلفة 30% من 100 => 130.
- تقريب 30% على 99 لأقرب 5 => 130.
- تسلسل Scanner سريع => true؛ كتابة بطيئة => false.

الملف القابل للتشغيل داخل المشروع بعد تركيب dependencies:

`npm run purchases:test`

### static flow/security checks

PASS:

- لوحة Excel لا تستدعي post ولا Prisma مباشرة.
- barcode scanner لا يستدعي post/save مباشرة.
- واجهة الفاتورة لها مدخل اعتماد واحد إلى `postPurchaseInvoiceAction`.
- الاعتماد Serializable.
- الفاتورة تقفل `FOR UPDATE`.
- `POSTED` يعيد نتيجة idempotent ولا يعيد الكميات.
- سطر matching غير محسوم يمنع الاعتماد.
- استعلامات purchase الأساسية scoped بـ `shopId`.
- تحديث سعر البيع مربوط بـ `updateSalePrice`.
- توافقات الصنف الموجود لا يعاد كتابتها من فاتورة شراء.
- توافقات الصنف الجديد تتحقق من دليل التوافقات قبل الربط.
- clone يبدأ paid=0 وsupplierInvoiceNumber=null وpaymentReference=null.
- barcode unique index scoped إلى active items داخل `shopId`.
- الكاميرا feature-gated.
- scanner timing-gated.

### syntax check

تم تمرير الملفات الجديدة على `tsc --noEmit --noResolve`. لم تظهر أخطاء parsing/syntax. ظهرت فقط أخطاء resolution/types المتوقعة لأن هذه الحزمة المعزولة لا تحتوي `node_modules` أو بقية ملفات المشروع.

## ما لم يكن ممكناً اختباره هنا

- لم يتم تشغيل `prisma generate` أو `next build` الكامل لأن بيئة الحاوية لا تستطيع resolve لـ GitHub ولا توجد نسخة كاملة مركبة من repository/dependencies.
- لم يتم تشغيل migration على PostgreSQL لأن حساب Supabase المتاح يحتوي المشروع الرئيسي فقط ولا توجد Development Branch معزولة؛ لم تتم الكتابة عليه حفاظاً على الإنتاج.
- لذلك اختبارات transaction الفعلية ضد DB (rollback، double-submit concurrent، tenant cross-access) ما زالت مطلوبة على قاعدة اختبار معزولة قبل أي preview deployment.
- اختبار camera الحقيقي يحتاج متصفح/جهاز يدعم BarcodeDetector وHTTPS أو سياقاً آمناً؛ الواجهة لا تعرض الكاميرا إن لم يتحقق ذلك.

## التحقق قبل أي نشر لاحق

على قاعدة اختبار فقط:

1. تحقق من `DATABASE_URL` أنها ليست الإنتاج.
2. طبق migration 123000 ثم 143000.
3. `npm run prisma:generate`
4. `npm run purchases:test`
5. `npm run build`
6. اختبر فاتورة 20 بنداً (موجود + جديد)، full/partial/unpaid.
7. اختبر double POST متزامن ومرة بعد نجاح الطلب.
8. اختبر rollback بإجبار فشل وسط الاعتماد.
9. اختبر حسابين بمتجرين مختلفين على purchase/barcode/search/detail.
10. اختبر الهاتف والكمبيوتر وDark Mode والـ scanner الحقيقي إن توفر.

لا يوجد push أو Vercel ضمن هذه الحزمة.

---

# المرحلة 3 — استيراد مسودة من صورة / PDF / نص واتساب منسوخ

## فحص التكاملات قبل التنفيذ

- لم يوجد في `package.json` أي OpenAI / Anthropic / Gemini / AI SDK / OCR package مهيأ للمشروع.
- لم يتم العثور على تكامل ذكاء اصطناعي قائم يمكن إعادة استخدامه بأمان.
- التخزين السابق لمرفقات الموردين يستخدم بيانات خاصة داخل PostgreSQL (`BYTEA`) مرتبطة بحركة مخزون بعد الاعتماد؛ لذلك لم يتم ربط مصدر المسودة بذلك الجدول، لكن تم إعادة استخدام نفس مبدأ **التخزين الخاص بلا رابط عام** في `PurchaseImportSource` المرتبط بمسودة فاتورة الشراء.
- لا توجد Supabase Development Branch معزولة في الحساب المتصل، لذلك لم تُطبق migrations ولم تتم أي كتابة على مشروع الإنتاج.

## ما يعمل بدون أي خدمة خارجية

### لصق نص رسالة واتساب يدوياً

- المستخدم يلصق النص بنفسه؛ لا يوجد ربط واتساب ولا قراءة رسائل الحساب.
- parser حتمي على الخادم يستخرج عند توفرها:
  - المورد
  - التاريخ
  - رقم فاتورة المورد
  - العملة
  - البنود
  - الكمية
  - وحدة الشراء
  - تكلفة الوحدة
  - إجمالي السطر
  - المجموع الفرعي
  - الخصم
  - الشحن
  - الإجمالي النهائي
- الأرقام العربية/الفارسية والرموز `٫` و`٬` مدعومة من نفس طبقة parsing الموجودة في استيراد Excel.
- القيمة غير المعروفة تبقى `null`/فارغة.
- السعر المنفرد غير الواضح لا يُحوّل تلقائياً إلى تكلفة وحدة؛ يبقى إجمالي سطر محتمل مع `priceAmbiguous=true` حتى يؤكده المستخدم.
- الكرتونة/الصندوق/الباكيت لا يتحول إلى عدد قطع افتراضي؛ السطر يطلب من المستخدم إدخال عدد قطع المخزون الفعلي وتأكيده.

## رفع صورة أو PDF

- أنواع الملف المدعومة بعد فحص magic bytes الفعلية، لا MIME المعلن فقط:
  - PDF
  - JPEG
  - PNG
  - WEBP
- الافتراضات الحالية القابلة للضبط:
  - أقصى حجم: 4 MB
  - أقصى PDF: 3 صفحات
- الملف يُحفظ في `PurchaseImportSource.fileData` كـ private `BYTEA`، ولا ينشأ public URL.
- فتح المصدر يتم فقط عبر route مصادق عليه ومحصور بـ `shopId` مع `inventory:read` و`Cache-Control: private, no-store`.
- الرفع وحده لا يستدعي الاعتماد ولا ينشئ InventoryItem ولا InventoryMovement ولا PurchasePayment.

## خدمة القراءة الفعلية للصور/PDF — OpenAI مباشرة

تم استبدال فكرة extractor الخارجي بتكامل مباشر من خادم مسار إلى OpenAI Responses API. لا يوجد استدعاء من المتصفح ولا أي `NEXT_PUBLIC_OPENAI_*`.

- النموذج الافتراضي: `gpt-4.1-mini`، وقابل للضبط عبر `PURCHASE_AI_MODEL`.
- المفتاح: `OPENAI_API_KEY` على الخادم فقط. عند غيابه تبقى الملفات والنص/Excel والإدخال اليدوي متاحة ولا يتم إرسال شيء إلى OpenAI.
- Structured Outputs بـ JSON Schema صارم، ثم Zod validation مستقل على الخادم.
- `store: false`.
- PDF يرسل inline كـ `input_file`، والصورة كـ `input_image`؛ لا يتم إنشاء OpenAI File object دائم في هذا التدفق.
- `PURCHASE_AI_PDF_DETAIL=auto|low|high` ينتقل فعلياً إلى `input_file.detail`.
- الحصة: 3 قراءات AI يومياً للمستخدم، و6 للمتجر افتراضياً، مع ميزانية ميزة تطبيقية 5 USD ومحاولات فشل محدودة.
- الرفع وحده لا يستهلك حصة ولا يرسل إلى AI؛ إعادة قراءة مقصودة تستخدم طلباً جديداً.
- لا توجد retries مكلفة غير محدودة، وEXTRACTING القديمة لها مهلة وملكية محاولة.
- تقديرات الحجز المالي ليست تكلفة مقاسة ولا ضماناً لرصيد حساب OpenAI؛ التسوية تعتمد على `usage` عندما تكون نتيجة المزود مؤكدة.

إعدادات الخادم موثقة في `.env.example`.

## شاشة المراجعة

الملف:

`app/inventory/purchases/_document-import-panel.tsx`

- على الكمبيوتر: المصدر الأصلي بجانب البنود المستخرجة.
- على الهاتف: تبويب واضح بين المصدر والبنود لتجنب عمودين ضيقين.
- الحالات المرئية بدون confidence numbers مختلقة:
  - صنف موجود
  - مقترح يحتاج تأكيداً
  - صنف جديد
  - قراءة ناقصة
- المطابقة الدقيقة بالباركود/SKU يمكن أن تعرف الصنف.
- اقتراحات الاسم لا تعتمد تلقائياً.
- اختلاف/تكرار معرف دقيق يعيد السطر إلى المراجعة ولا تسمح ذاكرة المورد بتجاوزه.
- يعرض النص الأصلي لكل سطر.
- يعرض إجمالي السطر المستخرج كمرجع منفصل عن تكلفة الوحدة.
- مقارنة إجمالي البنود بإجمالي المصدر تظهر الفرق دون تعديل أي رقم.
- إذا كانت المقارنة ناقصة بسبب وحدة/سعر/كمية مبهمة، توضح ذلك صراحةً.

## النقل إلى مسودة الشراء الحالية

- المصدر مرتبط أولاً بمسودة محفوظة.
- `PurchaseItem.importSourceId + importRowKey` يحفظ provenance.
- النقل **append-only**: لا توجد عملية replace-all للفاتورة الحالية.
- البنود الموجودة للمستخدم لا تُستبدل.
- البنود المنقولة مسبقاً من نفس المصدر والسطر تُتجاوز في الواجهة.
- يوجد unique DB index على `(shopId, purchaseInvoiceId, importSourceId, importRowKey)` كطبقة حماية إضافية من التكرار.
- `saveDraft` يتحقق أن كل `importSourceId` يعود لنفس `shopId` ولنفس `purchaseInvoiceId`.
- لا يوجد في مسارات import أي استدعاء إلى `postPurchaseInvoice` أو إنشاء InventoryMovement/Payment.
- بعد النقل تصبح البنود بنود المسودة العادية وتصل لاحقاً إلى **نفس منطق الاعتماد الذري الموجود**؛ لم يُنشأ مسار محاسبي أو مخزني بديل.

## ذاكرة أسماء الموردين

الجدول:

`SupplierItemAlias`

- لا يُحفظ إلا عند ضغط المستخدم صراحةً على «تذكّر هذه التسمية لهذا المورد» بعد اختيار InventoryItem.
- المفتاح النشط unique داخل `shopId + supplierId + normalizedAlias`.
- يمكن تغيير المطابقة باختيار صنف آخر وحفظها مجدداً.
- يمكن إلغاء المطابقة (soft delete).
- لا توجد مشاركة بين المتاجر أو الموردين.
- alias exact فقط؛ لا fuzzy alias.
- إذا كان المصدر يحمل barcode يتعارض مع barcode/SKU الصنف المختار، يرفض الخادم حفظ/تطبيق alias.
- اختلاف الاسم نفسه (Original/Copy/لون/موديل) ينتج normalized alias مختلفاً، ولا يوجد توسيع تلقائي للتشابه.

## منع التكرار والتكلفة

- `contentSha256 + shopId + purchaseInvoiceId + extractionVersion` يمنع رفع نفس المحتوى كنسخة جديدة داخل نفس المسودة.
- `requestKey` unique داخل `shopId` يمنع إعادة طلب الاستخراج نفسه بالخطأ.
- حالة `EXTRACTING` تمنع تشغيل قراءة متزامنة ثانية لنفس المصدر.
- حد طلبات القراءة في الساعة configurable لكل متجر.
- إعادة فتح source في `REVIEW_READY` تعيد النتيجة الموجودة ولا تعيد استدعاء المزود.
- لا يتم تسجيل محتوى الفاتورة الكامل أو token في `console`.
- الأخطاء المخزنة هي أكواد ورسائل آمنة فقط؛ لا يتم تخزين body خطأ المزود.
- لم تُربط الميزة بأي خطة اشتراك جديدة. فقط صلاحيات/حالة التشغيل الموجودة أصلاً في مسار مستخدمة.

## migration المرحلة 3

`prisma/migrations/20260906170000_purchase_document_import/migration.sql`

تضيف:

- `PurchaseImportSource`
- `PurchaseImportExtractionAttempt`
- `SupplierItemAlias`
- provenance fields على `PurchaseItem`
- unique indexes للتكرار/idempotency
- FKs + RLS/revoke للنماذج server-only

Patch إضافي للـ Prisma schema وpackage script:

`patches/phase3-existing-files.patch`

**لم يتم تطبيق migration على أي قاعدة بيانات.**

## التحقق المنفذ للمرحلة 3

### اختبارات فعلية للـ parser/helper code بعينات محلية

تم تشغيل نسخة compiled من نفس parser/helper logic (مع استبدال Zod فقط في harness لأن هذه الحزمة لا تحتوي dependencies):

- فاتورة عربية واضحة: المورد/الرقم/التاريخ/سطران/خصم/شحن/الإجمالي.
- نص عربي/إنجليزي مختلط، بما فيه `٢` و`١٢٫٥` وSAR.
- `الخصم` و`الشحن` بصيغة التعريف لا يتحولان إلى بنود — تم اكتشاف هذا bug أثناء الاختبار وإصلاحه.
- `Currency: SAR` لا يتحول إلى بند — تم اكتشافه وإصلاحه.
- إجمالي عربي عادي `الإجمالي: 40` تتم قراءته ومقارنته — تم اكتشاف هذا bug وإصلاحه.
- وحدة كرتونة: لا unitCost مخمّن، `unitAmbiguous=true`، وإجمالي السطر محفوظ كمرجع.
- إجمالي مصدر 40 مقابل بنود محسوبة 25 => الفرق 15 بدون تعديل تلقائي.
- PDF synthetic بثلاث صفحات ضمن الحد الحالي 3 => مقبول؛ نفس الملف عند حد صفحتين => مرفوض.
- JPEG magic bytes صالح كنوع ملف.
- Original/Copy متشابهان بالاسم => review وليس auto-match.

النتيجة النهائية:

`PASS phase3 document samples`

### Static security/flow test

`node scripts/test-purchase-document-security.cjs`

النتيجة:

`PASS purchase document security/static flow`

ويتحقق من عزل `shopId`، private source route، idempotency indexes، supplier alias scoping، RLS، عدم replace، validation لمصدر السطر، وتعليمات untrusted content، وغياب أي posting/InventoryMovement/PurchasePayment من import path.

### Syntax-only TypeScript check

تم تشغيل:

```text
tsc --noEmit --noCheck ...
```

على ملفات المرحلة 3 الجديدة/المعدلة ونجح بدون أخطاء syntax/parsing.

## ما تم اختباره بعينات فقط وليس تكاملاً حقيقياً

- **الصورة الضعيفة:** اختُبرت حالة schema ناقصة/ambiguous كعينة، وليس OCR حقيقياً.
- **PDF متعدد الصفحات:** تم اختبار تحقق نوع/عدد صفحات PDF synthetic، وليس قراءة محتواه بواسطة AI/OCR.
- **OpenAI الحقيقي:** التكامل موجود لكن لم يتم إجراء طلب فعلي لعدم وجود `OPENAI_API_KEY` وبيئة DB معزولة؛ اختبارات المزود الفعلية مؤجلة.
- **Zod runtime validation الحقيقي:** الكود موجود، لكن الحزمة المعزولة هنا لا تحتوي `node_modules`; harness المحلي استبدل schema parse فقط لاختبار parser نفسه.
- **PostgreSQL transaction/indexes/RLS:** لم تُطبق migration لأن قاعدة التطوير المعزولة غير متاحة.
- **Next build/full typecheck/browser visual QA:** لم يتم تشغيلها في هذه البيئة لعدم وجود clone كامل/dependencies.

قبل أي نشر لاحق اتبع `VERIFICATION_RUNBOOK.md` على PostgreSQL معزول، ثم اختبر UI حقيقياً هاتف/كمبيوتر. لا تستخدم Preview الحالي ما دام متصلاً بقاعدة الإنتاج.

لا يوجد push ولا Vercel ولا تعديل على قاعدة الإنتاج ضمن هذه المرحلة.
