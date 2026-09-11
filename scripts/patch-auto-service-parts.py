from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"{label}: start marker not found")
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:i] + replacement + text[j:]


# ------------------------------------------------------------------
# Service-order domain: warehouse-aware lifecycle.
# ------------------------------------------------------------------
path = Path("lib/services/autoServiceOrderService.ts")
text = path.read_text()
import_marker = 'import { prisma } from "@/lib/prisma";\n'
import_block = '''import { prisma } from "@/lib/prisma";\nimport {\n  approvePlannedServiceLinesInTx,\n  completeServiceWorkInTx,\n  consumeServiceOrderPartsInTx,\n  markServiceWorkInProgressInTx,\n  releaseServiceOrderReservationsInTx,\n  reserveServiceOrderPartsInTx,\n} from "@/lib/services/servicePartInventoryService";\n'''
text = replace_once(text, import_marker, import_block, "autoServiceOrderService imports")

old_part_query = '''    prisma.$queryRaw<Array<Record<string, unknown>>>`\n      SELECT * FROM "ServicePartLine"\n      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid\n      ORDER BY "sortOrder", "createdAt"\n    `,'''
new_part_query = '''    prisma.$queryRaw<Array<Record<string, unknown>>>`\n      SELECT spl.*, w."name" AS "warehouseName", i."sku", i."barcode"\n      FROM "ServicePartLine" spl\n      LEFT JOIN "Warehouse" w\n        ON w."id" = spl."warehouseId" AND w."shopId" = spl."shopId"\n      LEFT JOIN "InventoryItem" i\n        ON i."id" = spl."inventoryItemId" AND i."shopId" = spl."shopId"\n      WHERE spl."shopId" = ${shopId}::uuid AND spl."serviceOrderId" = ${serviceOrderId}::uuid\n      ORDER BY spl."sortOrder", spl."createdAt"\n    `,'''
text = replace_once(text, old_part_query, new_part_query, "service part detail query")

update_status = r'''export async function updateServiceOrderStatus(
  shopId: string,
  serviceOrderId: string,
  toStatus: ServiceOrderStatus,
  changedByUserId: string,
  note?: string | null,
) {
  if (!SERVICE_ORDER_STATUSES.includes(toStatus)) throw new Error("حالة أمر الصيانة غير معروفة.");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: ServiceOrderStatus }>>`
      SELECT "id", "status"
      FROM "ServiceOrder"
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new Error("أمر الصيانة غير موجود.");
    if (current.status === toStatus) return current;

    if (!ALLOWED_TRANSITIONS[current.status]?.includes(toStatus)) {
      throw new Error(`لا يمكن نقل أمر الصيانة من ${current.status} إلى ${toStatus}.`);
    }

    let effectiveStatus: ServiceOrderStatus = toStatus;
    let lifecycleNote = emptyToNull(note);

    if (toStatus === "APPROVED") {
      await approvePlannedServiceLinesInTx(tx, shopId, serviceOrderId);
      const missing = await reserveServiceOrderPartsInTx(tx, shopId, serviceOrderId);
      if (missing.length) {
        effectiveStatus = "WAITING_PARTS";
        const shortage = missing
          .map((part) => `${part.partName}: مطلوب ${part.requiredQuantity}، متاح ${part.availableQuantity}`)
          .join("؛ ");
        lifecycleNote = [lifecycleNote, `بانتظار قطع — ${shortage}`].filter(Boolean).join(" • ");
      }
    }

    if (toStatus === "IN_SERVICE") {
      await approvePlannedServiceLinesInTx(tx, shopId, serviceOrderId);
      await consumeServiceOrderPartsInTx(tx, shopId, serviceOrderId, changedByUserId);
      await markServiceWorkInProgressInTx(tx, shopId, serviceOrderId);
    }

    if (toStatus === "READY_FOR_DELIVERY") {
      await approvePlannedServiceLinesInTx(tx, shopId, serviceOrderId);
      await consumeServiceOrderPartsInTx(tx, shopId, serviceOrderId, changedByUserId);
      await completeServiceWorkInTx(tx, shopId, serviceOrderId);
    }

    if (toStatus === "CANCELLED" || toStatus === "REJECTED") {
      await releaseServiceOrderReservationsInTx(tx, shopId, serviceOrderId);
    }

    const updated = await tx.$queryRaw<Array<{ id: string; status: ServiceOrderStatus }>>`
      UPDATE "ServiceOrder"
      SET "status" = ${effectiveStatus},
          "approvedAt" = CASE WHEN ${toStatus} = 'APPROVED' THEN COALESCE("approvedAt", now()) ELSE "approvedAt" END,
          "startedAt" = CASE WHEN ${effectiveStatus} = 'IN_SERVICE' THEN COALESCE("startedAt", now()) ELSE "startedAt" END,
          "readyAt" = CASE WHEN ${effectiveStatus} = 'READY_FOR_DELIVERY' THEN COALESCE("readyAt", now()) ELSE "readyAt" END,
          "deliveredAt" = CASE WHEN ${effectiveStatus} = 'DELIVERED' THEN COALESCE("deliveredAt", now()) ELSE "deliveredAt" END,
          "closedAt" = CASE WHEN ${effectiveStatus} = 'CLOSED' THEN COALESCE("closedAt", now()) ELSE "closedAt" END,
          "updatedByUserId" = ${changedByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      RETURNING "id", "status"
    `;

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${serviceOrderId}::uuid, ${current.status}, ${effectiveStatus}, ${lifecycleNote}, ${changedByUserId}::uuid)
    `;

    return updated[0];
  });
}

'''
text = replace_between(
    text,
    "export async function updateServiceOrderStatus(\n",
    "async function assertOrderEditable",
    update_status,
    "updateServiceOrderStatus",
)

add_part = r'''export async function addPartLine(
  shopId: string,
  serviceOrderId: string,
  input: {
    inventoryItemId?: string | null;
    warehouseId?: string | null;
    partName?: string | null;
    quantity?: number;
    unitCost?: number | null;
    unitPrice?: number | null;
    notes?: string | null;
  },
) {
  await assertOrderEditable(shopId, serviceOrderId);
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("كمية قطعة الغيار غير صالحة.");
  if (input.unitPrice != null && input.unitPrice < 0) throw new Error("سعر قطعة الغيار غير صالح.");
  if (input.unitCost != null && input.unitCost < 0) throw new Error("تكلفة قطعة الغيار غير صالحة.");

  let partName = input.partName?.trim() ?? "";
  let unitPrice = input.unitPrice ?? null;
  let unitCost = input.unitCost ?? null;
  let warehouseId = input.warehouseId ?? null;

  if (input.inventoryItemId) {
    const items = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      unitPrice: number;
      unitCost: number | null;
    }>>`
      SELECT "id", "name", "unitPrice"::double precision AS "unitPrice",
             "unitCost"::double precision AS "unitCost"
      FROM "InventoryItem"
      WHERE "id" = ${input.inventoryItemId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      LIMIT 1
    `;
    const item = items[0];
    if (!item) throw new Error("قطعة المخزون غير موجودة في هذا المركز.");

    if (warehouseId) {
      const warehouses = await prisma.$queryRaw<Array<{ id: string; averageCost: number | null }>>`
        SELECT w."id", COALESCE(ws."averageCost", i."unitCost")::double precision AS "averageCost"
        FROM "Warehouse" w
        JOIN "InventoryItem" i ON i."id" = ${input.inventoryItemId}::uuid AND i."shopId" = w."shopId"
        LEFT JOIN "WarehouseStock" ws
          ON ws."shopId" = w."shopId"
         AND ws."warehouseId" = w."id"
         AND ws."inventoryItemId" = i."id"
        WHERE w."id" = ${warehouseId}::uuid
          AND w."shopId" = ${shopId}::uuid
          AND w."deletedAt" IS NULL
          AND w."isActive" = true
        LIMIT 1
      `;
      if (!warehouses[0]) throw new Error("المستودع المحدد غير موجود أو غير نشط.");
      unitCost = unitCost ?? warehouses[0].averageCost;
    } else {
      const defaults = await prisma.$queryRaw<Array<{ id: string; averageCost: number | null }>>`
        SELECT w."id", COALESCE(ws."averageCost", i."unitCost")::double precision AS "averageCost"
        FROM "Warehouse" w
        JOIN "InventoryItem" i ON i."id" = ${input.inventoryItemId}::uuid AND i."shopId" = w."shopId"
        LEFT JOIN "WarehouseStock" ws
          ON ws."shopId" = w."shopId"
         AND ws."warehouseId" = w."id"
         AND ws."inventoryItemId" = i."id"
        WHERE w."shopId" = ${shopId}::uuid
          AND w."deletedAt" IS NULL
          AND w."isActive" = true
        ORDER BY w."isDefault" DESC, COALESCE(ws."quantity" - ws."reservedQuantity", 0) DESC, w."name" ASC
        LIMIT 1
      `;
      if (defaults[0]) {
        warehouseId = defaults[0].id;
        unitCost = unitCost ?? defaults[0].averageCost;
      }
    }

    partName = partName || item.name;
    unitPrice = unitPrice ?? item.unitPrice;
    unitCost = unitCost ?? item.unitCost;
  }

  if (!partName) throw new Error("اسم قطعة الغيار مطلوب.");
  if (unitPrice == null || unitPrice < 0) throw new Error("سعر بيع قطعة الغيار مطلوب وغير صالح.");

  const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    INSERT INTO "ServicePartLine" (
      "shopId", "serviceOrderId", "inventoryItemId", "warehouseId", "partName", "quantity", "unitCost", "unitPrice", "lineTotal", "notes"
    ) VALUES (
      ${shopId}::uuid, ${serviceOrderId}::uuid, ${input.inventoryItemId ?? null}::uuid, ${warehouseId}::uuid, ${partName}, ${quantity},
      ${unitCost}, ${unitPrice}, ${lineTotal}, ${emptyToNull(input.notes)}
    )
    RETURNING *
  `;
  return rows[0];
}

'''
text = replace_between(
    text,
    "export async function addPartLine(\n",
    "export async function createInspection(\n",
    add_part,
    "addPartLine",
)
path.write_text(text)

# ------------------------------------------------------------------
# Quote approvals: sync approved/rejected work and reserve stock.
# ------------------------------------------------------------------
path = Path("lib/services/quotationService.ts")
text = path.read_text()
q_import = 'import { prisma } from "@/lib/prisma";\n'
q_import_new = '''import { prisma } from "@/lib/prisma";\nimport {\n  reserveServiceOrderPartsInTx,\n  syncQuotationApprovalsToServiceLinesInTx,\n} from "@/lib/services/servicePartInventoryService";\n'''
text = replace_once(text, q_import, q_import_new, "quotation imports")

old_guard = '''    if (["DELIVERED", "CLOSED", "CANCELLED", "REJECTED"].includes(order.status)) {\n      throw new Error("لا يمكن إنشاء عرض سعر لأمر صيانة منتهي أو ملغى.");\n    }'''
new_guard = '''    if (!["RECEIVED", "INSPECTING", "WAITING_CUSTOMER_APPROVAL"].includes(order.status)) {\n      throw new Error("يمكن إنشاء عرض السعر قبل بدء تنفيذ الصيانة فقط.");\n    }'''
text = replace_once(text, old_guard, new_guard, "quotation lifecycle guard")
text = replace_once(
    text,
    '    if (currentStatus === "INSPECTING") {',
    '    if (currentStatus === "RECEIVED" || currentStatus === "INSPECTING") {',
    "quote sent transition",
)
text = replace_once(
    text,
    "        VALUES (${shopId}::uuid, ${quote.serviceOrderId}::uuid, 'INSPECTING', 'WAITING_CUSTOMER_APPROVAL', ${changedByUserId}::uuid)",
    "        VALUES (${shopId}::uuid, ${quote.serviceOrderId}::uuid, ${currentStatus}, 'WAITING_CUSTOMER_APPROVAL', ${changedByUserId}::uuid)",
    "quote sent history",
)

customer_marker = '    const customerRows = await tx.$queryRaw<Array<{ customerName: string; customerPhone: string | null; orderStatus: string }>>`'
text = replace_once(
    text,
    customer_marker,
    '    await syncQuotationApprovalsToServiceLinesInTx(tx, shopId, quotationId);\n\n' + customer_marker,
    "sync quotation work lines",
)

start = '    const targetOrderStatus = input.decision === "REJECTED" ? "REJECTED" : "APPROVED";\n'
end = '    return { id: approvals[0].id, decidedAt: approvals[0].decidedAt, decision: input.decision };'
replacement = r'''    let targetOrderStatus = input.decision === "REJECTED" ? "REJECTED" : "APPROVED";
    let missingParts: Awaited<ReturnType<typeof reserveServiceOrderPartsInTx>> = [];
    if (input.decision !== "REJECTED") {
      missingParts = await reserveServiceOrderPartsInTx(tx, shopId, quote.serviceOrderId);
      if (missingParts.length) targetOrderStatus = "WAITING_PARTS";
    }

    const shortageNote = missingParts.length
      ? `بانتظار قطع — ${missingParts.map((part) => `${part.partName}: مطلوب ${part.requiredQuantity}، متاح ${part.availableQuantity}`).join("؛ ")}`
      : null;
    const historyNote = [emptyToNull(input.note), shortageNote].filter(Boolean).join(" • ") || null;

    if (["RECEIVED", "INSPECTING", "WAITING_CUSTOMER_APPROVAL"].includes(context.orderStatus)) {
      await tx.$executeRaw`
        UPDATE "ServiceOrder"
        SET "status" = ${targetOrderStatus},
            "approvedAt" = CASE WHEN ${input.decision} <> 'REJECTED' THEN COALESCE("approvedAt", now()) ELSE "approvedAt" END,
            "updatedByUserId" = ${recordedByUserId}::uuid,
            "updatedAt" = now(),
            "version" = "version" + 1
        WHERE "id" = ${quote.serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId")
        VALUES (${shopId}::uuid, ${quote.serviceOrderId}::uuid, ${context.orderStatus}, ${targetOrderStatus}, ${historyNote}, ${recordedByUserId}::uuid)
      `;
    }

'''
text = replace_between(text, start, end, replacement, "quotation approval lifecycle")
path.write_text(text)

# ------------------------------------------------------------------
# Server action: parse inventory + warehouse selection.
# ------------------------------------------------------------------
path = Path("app/service-orders/actions.ts")
text = path.read_text()
new_action = r'''export async function addServicePartLineAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const inventorySelection = readString(formData, "inventorySelection");
  let inventoryItemId = readString(formData, "inventoryItemId") || null;
  let warehouseId = readString(formData, "warehouseId") || null;

  if (inventorySelection) {
    const [itemId, selectedWarehouseId, ...extra] = inventorySelection.split("|");
    if (!itemId || !selectedWarehouseId || extra.length) throw new Error("اختيار قطعة المخزون غير صالح.");
    inventoryItemId = z.string().uuid().parse(itemId);
    warehouseId = z.string().uuid().parse(selectedWarehouseId);
  } else {
    if (inventoryItemId) inventoryItemId = z.string().uuid().parse(inventoryItemId);
    if (warehouseId) warehouseId = z.string().uuid().parse(warehouseId);
  }

  const auth = await requirePermission("service_orders:update");
  if (inventoryItemId) await requirePermission("inventory:use_parts");

  await autoServiceOrderService.addPartLine(auth.shop.id, serviceOrderId, {
    inventoryItemId,
    warehouseId,
    partName: readString(formData, "partName"),
    quantity: optionalInteger(readString(formData, "quantity")) ?? 1,
    unitCost: optionalNumber(readString(formData, "unitCost")),
    unitPrice: optionalNumber(readString(formData, "unitPrice")),
    notes: readString(formData, "notes"),
  });

  revalidatePath(`/service-orders/${serviceOrderId}`);
}

'''
text = replace_between(
    text,
    "export async function addServicePartLineAction(formData: FormData) {\n",
    "export async function createServiceInspectionAction(formData: FormData) {\n",
    new_action,
    "addServicePartLineAction",
)
path.write_text(text)

# ------------------------------------------------------------------
# Service-order workspace UI: choose a concrete inventory/warehouse.
# ------------------------------------------------------------------
path = Path("app/service-orders/[id]/page.tsx")
text = path.read_text()
ui_import = 'import { serviceInspectionService } from "@/lib/services/serviceInspectionService";\n'
ui_import_new = '''import { serviceInspectionService } from "@/lib/services/serviceInspectionService";\nimport { servicePartInventoryService } from "@/lib/services/servicePartInventoryService";\n'''
text = replace_once(text, ui_import, ui_import_new, "service order page import")

old_type = 'type PartRow = { id: string; partName: string; quantity: number; unitCost: string | number | null; unitPrice: string | number; lineTotal: string | number; status: string; notes?: string | null };'
new_type = 'type PartRow = { id: string; partName: string; quantity: number; unitCost: string | number | null; unitPrice: string | number; lineTotal: string | number; status: string; notes?: string | null; warehouseName?: string | null; sku?: string | null; barcode?: string | null };'
text = replace_once(text, old_type, new_type, "PartRow type")

old_load = '''  const [order, inspections] = await Promise.all([\n    autoServiceOrderService.getServiceOrderById(auth.shop.id, id),\n    serviceInspectionService.listServiceInspections(auth.shop.id, id),\n  ]);'''
new_load = '''  const [order, inspections, inventoryChoices] = await Promise.all([\n    autoServiceOrderService.getServiceOrderById(auth.shop.id, id),\n    serviceInspectionService.listServiceInspections(auth.shop.id, id),\n    servicePartInventoryService.listServicePartInventoryChoices(auth.shop.id),\n  ]);'''
text = replace_once(text, old_load, new_load, "page loaders")

old_list = '''            {partLines.length ? partLines.map((line) => <div key={line.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div className="font-bold text-slate-800">{line.partName}</div><div className="shrink-0 font-black text-slate-950">{formatAutoMoney(line.lineTotal, auth.shop.currency)}</div></div><div className="mt-1 text-xs text-slate-500">{line.quantity} × {formatAutoMoney(line.unitPrice, auth.shop.currency)} • {line.status}</div></div>) : <div className="py-5 text-center text-sm font-bold text-slate-400">لا توجد قطع مضافة بعد</div>}'''
new_list = '''            {partLines.length ? partLines.map((line) => <div key={line.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-bold text-slate-800">{line.partName}</div>{line.warehouseName ? <div className="mt-1 text-[11px] font-bold text-slate-400">{line.warehouseName}{line.sku ? ` • SKU ${line.sku}` : ""}</div> : null}</div><div className="shrink-0 font-black text-slate-950">{formatAutoMoney(line.lineTotal, auth.shop.currency)}</div></div><div className="mt-1 text-xs text-slate-500">{line.quantity} × {formatAutoMoney(line.unitPrice, auth.shop.currency)} • {line.status}</div></div>) : <div className="py-5 text-center text-sm font-bold text-slate-400">لا توجد قطع مضافة بعد</div>}'''
text = replace_once(text, old_list, new_list, "part list UI")

old_form = '''          <form action={addServicePartLineAction} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">\n            <input type="hidden" name="serviceOrderId" value={order.id} />\n            <input name="partName" required className={`${inputClass} sm:col-span-2`} placeholder="اسم قطعة الغيار" />\n            <input name="quantity" type="number" min="1" step="1" defaultValue="1" className={inputClass} />\n            <input name="unitPrice" type="number" min="0" step="0.01" required className={inputClass} placeholder="سعر البيع" />\n            <input name="unitCost" type="number" min="0" step="0.000001" className={inputClass} placeholder="التكلفة (اختياري)" />\n            <Button type="submit" className="font-black sm:col-span-2"><Plus className="ml-1 h-4 w-4" />إضافة قطعة</Button>\n          </form>'''
new_form = '''          <form action={addServicePartLineAction} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">\n            <input type="hidden" name="serviceOrderId" value={order.id} />\n            <select name="inventorySelection" defaultValue="" className={`${inputClass} sm:col-span-2`}>\n              <option value="">قطعة يدوية / غير مرتبطة بالمخزون</option>\n              {inventoryChoices.map((choice) => (\n                <option key={`${choice.inventoryItemId}-${choice.warehouseId}`} value={`${choice.inventoryItemId}|${choice.warehouseId}`}>\n                  {choice.itemName} — {choice.warehouseName} — متاح {choice.availableQuantity}\n                </option>\n              ))}\n            </select>\n            <input name="partName" className={`${inputClass} sm:col-span-2`} placeholder="اسم قطعة يدوية، أو اتركه فارغاً عند اختيار قطعة من المخزون" />\n            <input name="quantity" type="number" min="1" step="1" defaultValue="1" className={inputClass} />\n            <input name="unitPrice" type="number" min="0" step="0.01" className={inputClass} placeholder="سعر البيع (يؤخذ من المخزون إذا ترك فارغاً)" />\n            <input name="unitCost" type="number" min="0" step="0.000001" className={inputClass} placeholder="التكلفة (تؤخذ من المستودع تلقائياً)" />\n            <input name="notes" className={inputClass} placeholder="ملاحظة (اختياري)" />\n            <Button type="submit" className="font-black sm:col-span-2"><Plus className="ml-1 h-4 w-4" />إضافة قطعة</Button>\n          </form>'''
text = replace_once(text, old_form, new_form, "part form UI")
path.write_text(text)
