# مراجعة النسخة المصححة

الأساس: الأرشيف المرفق الذي يعرّف نفسه بالـcommit d4f83fccbd3eb293adfa98a0f1394b25e988eccf.
هذه نسخة ملفات مصححة محليًا؛ ليست commit جديدًا منشورًا.

## ما تم إصلاحه
- توليد package-lock.json بواسطة npm الفعلي، وتثبيت الحزم بنجاح.
- تصحيح أخطاء TypeScript وتسلسل بيانات الحفظ دون استخدام any.
- منع فروق التقريب من إنتاج توزيع سالب؛ توزيع تراكمي للبنود والاستلام الجزئي.
- احتساب مجموع مرتجع المنتج المكرر عبر عدة بنود، بدل خصم كل بند من الرصيد الأول نفسه.
- السماح بالكاميرا من نفس الموقع لمسارات المشتريات فقط ضمن Permissions-Policy.
- إصلاح تشغيل اختبار استيراد المستندات.
- تبسيط workflow: فحص ملفات Git العادية بملف lock مثبت، دون payload أو كتابة commits تلقائيًا. صلاحياته contents:read.

## نتائج فعلية
- npm install --package-lock-only --ignore-scripts: نجح.
- npm ci --ignore-scripts: نجح.
- Prisma validate / generate: نجحا.
- npm run build: نجح بالكامل، بما يشمل TypeScript وESLint وتوليد الصفحات. توجد تحذيرات غير مانعة.
- اختبارات الاستيراد والمستندات: نجحت باستخدام node --import tsx.
- اختبار منطق التكلفة الفعلي: نجحت 1530 حالة توزيع وتقريب، ومثال المتوسط المرجح.
- اختبارات الحماية الساكنة وعينة lifecycle الموجودة: نجحت، وليست اختبارات PostgreSQL.

## الحدود
لم تُشغّل migrations على PostgreSQL، ولم يُختبر التزامن أو RLS فعليًا أو تدفق المشتريات في المتصفح. إصلاح المرتجع راجعناه في الخدمة الفعلية؛ لم ننفذ له اختبار قاعدة بيانات.
لم يُرسل طلب OpenAI ولم تُقَس تكلفة القراءة. لم يحدث push أو نشر أو تعديل على الإنتاج.
البناء استعمل DATABASE_URL محليًا وهميًا وليس رابط الإنتاج.
مراجعة SQL لا تُظهر حذف بيانات المخزون القديمة، لكنها ليست ضمانًا لنجاح migrations دون تشغيلها على قاعدة اختبار.

## الاستكمال
استخدم ملفات هذا الأرشيف كملفات مصدر عادية؛ لا تعِد أسلوب تقسيم payload.
قبل رفعها إلى فرع preview/purchase-receiving قارن بآخر main واحتفظ بتعديلاته، ولا تستبدل المستودع كاملًا عميانيًا. شغّل workflow على PostgreSQL المؤقت لمعرفة نتيجة migrations.
لتجربة الواجهة وعمليات المشتريات يلزم رابط قاعدة اختبار مستمرة في Preview. PostgreSQL الخاص بـActions مؤقت فقط.
أبقِ حاجز MASSAR_ALLOW_PREVIEW_DATABASE معطلاً حتى تتأكد أن رابط Preview لا يشير إلى الإنتاج، ولا تغيّر main أو بيئة Production.

## الملفات المعدلة مقارنة بالأرشيف المرفق
- .github/workflows/purchase-verification.yml
- app/inventory/purchases/_purchase-form.tsx
- app/inventory/purchases/_purchase-import-panel.tsx
- app/inventory/purchases/actions.ts
- lib/purchase-costing.ts
- lib/services/purchaseDocumentImportService.ts
- lib/services/purchaseReceivingService.ts
- next.config.ts
- package-lock.json
- scripts/test-purchase-document-import.ts
- scripts/test-purchase-cost-rounding.ts (جديد)
