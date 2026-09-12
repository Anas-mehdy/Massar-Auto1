from pathlib import Path

service_path = Path("lib/services/autoInvoiceService.ts")
text = service_path.read_text()

old = '''    const existing = await findActiveInvoiceTx(tx, shopId, serviceOrderId);
    if (existing) return existing;

    await assertBusinessDateOpenTx(tx, shopId, new Date());
'''
new = '''    const existing = await findActiveInvoiceTx(tx, shopId, serviceOrderId);
    if (existing) return existing;

    const warrantyLinks = await tx.$queryRaw<Array<{ claimNumber: string; coverageDecision: string }>>`
      SELECT "claimNumber", "coverageDecision"::text AS "coverageDecision"
      FROM "ServiceWarrantyClaim"
      WHERE "shopId" = ${shopId}::uuid
        AND "followUpServiceOrderId" = ${serviceOrderId}::uuid
      LIMIT 1
      FOR SHARE
    `;
    const warrantyClaim = warrantyLinks[0] ?? null;
    const fullyCoveredWarranty = warrantyClaim?.coverageDecision === "COVERED";

    await assertBusinessDateOpenTx(tx, shopId, new Date());
'''
if text.count(old) != 1:
    raise SystemExit(f"warranty invoice context anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)

old = '''    const subtotal = roundMoney(Number(totals[0]?.subtotal ?? 0));
    if (subtotal <= 0) throw new Error("لا يمكن إصدار فاتورة صيانة بدون أجور عمل أو قطع بقيمة أكبر من صفر.");
'''
new = '''    const subtotal = roundMoney(Number(totals[0]?.subtotal ?? 0));
    if (subtotal < 0) throw new Error("قيمة أعمال وقطع أمر الصيانة غير صالحة للفوترة.");
    if (subtotal === 0 && !fullyCoveredWarranty) {
      throw new Error("لا يمكن إصدار فاتورة صيانة بدون أجور عمل أو قطع بقيمة أكبر من صفر.");
    }
'''
if text.count(old) != 1:
    raise SystemExit(f"subtotal guard anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)

old = '''    discountTotal = Math.min(discountTotal, subtotal);
    const total = roundMoney(Math.max(0, subtotal - discountTotal + taxTotal));
    if (total <= 0) throw new Error("إجمالي فاتورة الصيانة يجب أن يكون أكبر من صفر.");
'''
new = '''    if (fullyCoveredWarranty) {
      // Preserve the commercial value of the work/parts in subtotal while keeping customer revenue/receivable at zero.
      discountTotal = subtotal;
      taxTotal = 0;
    } else {
      discountTotal = Math.min(discountTotal, subtotal);
    }
    const total = roundMoney(Math.max(0, subtotal - discountTotal + taxTotal));
    if (total < 0 || (!fullyCoveredWarranty && total <= 0)) {
      throw new Error("إجمالي فاتورة الصيانة يجب أن يكون أكبر من صفر.");
    }
'''
if text.count(old) != 1:
    raise SystemExit(f"total guard anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)

old = '''        "invoiceNumber", "type", "status", "subtotal", "discountTotal", "taxTotal",
        "total", "amountPaid", "balanceDue", "issuedAt", "createdAt", "updatedAt", "version"
      ) VALUES (
        gen_random_uuid(), ${shopId}::uuid, ${order.customerId}::uuid, ${serviceOrderId}::uuid, ${createdByUserId}::uuid,
        ${invoiceNumber}, 'REPAIR'::"InvoiceType", 'UNPAID'::"InvoiceStatus", ${subtotal}, ${discountTotal}, ${taxTotal},
        ${total}, 0, ${total}, now(), now(), now(), 1
'''
new = '''        "invoiceNumber", "type", "status", "subtotal", "discountTotal", "taxTotal",
        "total", "amountPaid", "balanceDue", "paidAt", "issuedAt", "createdAt", "updatedAt", "version"
      ) VALUES (
        gen_random_uuid(), ${shopId}::uuid, ${order.customerId}::uuid, ${serviceOrderId}::uuid, ${createdByUserId}::uuid,
        ${invoiceNumber}, 'REPAIR'::"InvoiceType",
        CASE WHEN ${fullyCoveredWarranty} THEN 'PAID'::"InvoiceStatus" ELSE 'UNPAID'::"InvoiceStatus" END,
        ${subtotal}, ${discountTotal}, ${taxTotal},
        ${total}, 0, ${total}, CASE WHEN ${fullyCoveredWarranty} THEN now() ELSE NULL END, now(), now(), now(), 1
'''
if text.count(old) != 1:
    raise SystemExit(f"invoice insert anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)
service_path.write_text(text)

page_path = Path("app/service-orders/[id]/page.tsx")
page = page_path.read_text()
old = '  const canReturnParts = canUpdateOrder && canUseInventory;\n'
new = old + '  const fullyCoveredWarranty = warrantyFollowUpLink?.coverageDecision === "COVERED";\n'
if page.count(old) != 1:
    raise SystemExit(f"warranty page variable anchor mismatch: {page.count(old)}")
page = page.replace(old, new, 1)

old = '<p className="mt-1 text-xs font-semibold text-slate-500">بعد اكتمال الصيانة تُصدر فاتورة مرتبطة مباشرة بأمر الصيانة. يمكن تحصيلها الآن أو إبقاء الرصيد على الذمة.</p>'
new = '<p className="mt-1 text-xs font-semibold text-slate-500">{fullyCoveredWarranty ? "أمر المتابعة مغطى بالكامل: ستُحفظ قيمة الأعمال والقطع مع خصم ضمان 100% وإجمالي مطلوب من العميل يساوي صفراً." : "بعد اكتمال الصيانة تُصدر فاتورة مرتبطة مباشرة بأمر الصيانة. يمكن تحصيلها الآن أو إبقاء الرصيد على الذمة."}</p>'
if page.count(old) != 1:
    raise SystemExit(f"invoice header copy anchor mismatch: {page.count(old)}")
page = page.replace(old, new, 1)

old = '''            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-black text-emerald-950">الصيانة جاهزة للفوترة</div><div className="mt-1 text-xs font-semibold text-emerald-800">سيتم احتساب أجور العمل والقطع الفعلية مع خصم وضريبة عرض السعر الموافق عليه.</div></div>
              <form action={createServiceOrderInvoiceAction}><input type="hidden" name="serviceOrderId" value={order.id} /><Button type="submit" className="font-black">إصدار فاتورة الصيانة</Button></form>
            </div>
'''
new = '''            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-black text-emerald-950">{fullyCoveredWarranty ? "جاهزة لفاتورة ضمان مغطاة بالكامل" : "الصيانة جاهزة للفوترة"}</div><div className="mt-1 text-xs font-semibold text-emerald-800">{fullyCoveredWarranty ? "سيحفظ النظام القيمة الفعلية للأعمال والقطع كقيمة قبل الخصم، ثم يطبق خصم ضمان 100% بدون إنشاء دفعة وهمية أو ذمة على العميل." : "سيتم احتساب أجور العمل والقطع الفعلية مع خصم وضريبة عرض السعر الموافق عليه."}</div></div>
              <form action={createServiceOrderInvoiceAction}><input type="hidden" name="serviceOrderId" value={order.id} /><Button type="submit" className="font-black">{fullyCoveredWarranty ? "إصدار فاتورة ضمان (0)" : "إصدار فاتورة الصيانة"}</Button></form>
            </div>
'''
if page.count(old) != 1:
    raise SystemExit(f"invoice CTA anchor mismatch: {page.count(old)}")
page = page.replace(old, new, 1)

old = '''            </div>
          ) : canIssueInvoice ? (
'''
new = '''            <>{fullyCoveredWarranty ? <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3 text-xs font-bold leading-6 text-cyan-900">فاتورة ضمان: قيمة الأعمال والقطع {formatAutoMoney(invoice.subtotal, auth.shop.currency)} • خصم الضمان {formatAutoMoney(invoice.discountTotal, auth.shop.currency)} • المطلوب من العميل {formatAutoMoney(invoice.total, auth.shop.currency)}.</div> : null}</>
            </div>
          ) : canIssueInvoice ? (
'''
if page.count(old) != 1:
    raise SystemExit(f"invoice warranty summary anchor mismatch: {page.count(old)}")
page = page.replace(old, new, 1)
page_path.write_text(page)
