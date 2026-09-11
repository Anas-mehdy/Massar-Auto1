from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# purchaseReceivingService.ts
# -----------------------------------------------------------------------------
p = Path("lib/services/purchaseReceivingService.ts")
s = p.read_text()

s = one(s,
'''export type RecordPurchaseReceiptInput = {
  requestKey: string;
  receivedAt: string | Date;
  reference?: string | null;''',
'''export type RecordPurchaseReceiptInput = {
  requestKey: string;
  receivedAt: string | Date;
  warehouseId?: string | null;
  reference?: string | null;''',
"receipt input warehouse")

s = one(s,
'''export type RecordSupplierReturnInput = {
  requestKey: string;
  reason: string;
  reference?: string | null;''',
'''export type RecordSupplierReturnInput = {
  requestKey: string;
  reason: string;
  warehouseId?: string | null;
  reference?: string | null;''',
"return input warehouse")

s = one(s,
'''  receipts: Array<{
    id: string;
    receivedAt: Date;
    reference: string | null;''',
'''  receipts: Array<{
    id: string;
    receivedAt: Date;
    warehouseId: string | null;
    warehouseName: string | null;
    reference: string | null;''',
"receipt detail fields")

s = one(s,
'''  supplierReturns: Array<{
    id: string;
    reason: string;
    reference: string | null;''',
'''  supplierReturns: Array<{
    id: string;
    reason: string;
    warehouseId: string | null;
    warehouseName: string | null;
    reference: string | null;''',
"return detail fields")

resolve_marker = '''async function createReceiptTx(
'''
resolve_helper = '''async function resolvePurchaseWarehouseTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  warehouseId?: string | null,
) {
  const normalized = nullableText(warehouseId);
  if (!normalized) return ensureDefaultWarehouseTx(tx, shopId);
  const rows = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name"
    FROM "Warehouse"
    WHERE "id" = ${normalized}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    LIMIT 1
    FOR UPDATE
  `;
  if (!rows[0]) throw new Error("المستودع المحدد غير موجود أو غير نشط في هذا المركز.");
  return rows[0];
}

'''
s = one(s, resolve_marker, resolve_helper + resolve_marker, "resolve warehouse helper")

s = one(s,
'''    receivedAt: Date;
    reference?: string | null;
    note?: string | null;''',
'''    receivedAt: Date;
    warehouseId?: string | null;
    reference?: string | null;
    note?: string | null;''',
"create receipt input warehouse")

s = one(s,
'''  const positiveLines = input.lines.filter((line) => line.quantity > 0);
  if (!positiveLines.length) return null;
  const receiptRows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "PurchaseReceipt" ("shopId", "purchaseInvoiceId", "createdByUserId", "requestKey", "requestFingerprint", "receivedAt", "reference", "note")
    VALUES (${input.shopId}::uuid, ${input.purchase.id}::uuid, ${input.userId}::uuid, ${input.requestKey}, ${input.requestFingerprint}, ${input.receivedAt}, ${nullableText(input.reference)}, ${nullableText(input.note)})''',
'''  const positiveLines = input.lines.filter((line) => line.quantity > 0);
  if (!positiveLines.length) return null;
  const warehouse = await resolvePurchaseWarehouseTx(tx, input.shopId, input.warehouseId);
  const receiptRows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "PurchaseReceipt" ("shopId", "purchaseInvoiceId", "warehouseId", "createdByUserId", "requestKey", "requestFingerprint", "receivedAt", "reference", "note")
    VALUES (${input.shopId}::uuid, ${input.purchase.id}::uuid, ${warehouse.id}::uuid, ${input.userId}::uuid, ${input.requestKey}, ${input.requestFingerprint}, ${input.receivedAt}, ${nullableText(input.reference)}, ${nullableText(input.note)})''',
"receipt insert warehouse")

s = one(s,
'''  const receiptId = receiptRows[0]?.id;
  if (!receiptId) throw new Error("تعذر إنشاء سجل الاستلام.");
  const warehouse = await ensureDefaultWarehouseTx(tx, input.shopId);

  for (const line of positiveLines) {''',
'''  const receiptId = receiptRows[0]?.id;
  if (!receiptId) throw new Error("تعذر إنشاء سجل الاستلام.");

  for (const line of positiveLines) {''',
"remove forced default receipt warehouse")

s = one(s,
'''  options: { receiptMode?: PurchaseReceiptMode; initialReceipt?: InitialPurchaseReceiptLineInput[] } = {},
) {''',
'''  options: { receiptMode?: PurchaseReceiptMode; initialReceipt?: InitialPurchaseReceiptLineInput[]; warehouseId?: string | null } = {},
) {''',
"post options warehouse")

s = one(s,
'''  const normalizedInitialReceipt = [...(options.initialReceipt ?? [])]
    .map((entry) => ({ sortOrder: Number(entry.sortOrder), quantity: Number(entry.quantity) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const postingFingerprint = requestFingerprint({ purchaseId, receiptMode, initialReceipt: normalizedInitialReceipt });''',
'''  const normalizedInitialReceipt = [...(options.initialReceipt ?? [])]
    .map((entry) => ({ sortOrder: Number(entry.sortOrder), quantity: Number(entry.quantity) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const receiptWarehouseId = nullableText(options.warehouseId);
  const postingFingerprint = requestFingerprint({ purchaseId, receiptMode, initialReceipt: normalizedInitialReceipt, warehouseId: receiptWarehouseId });''',
"post fingerprint warehouse")

s = one(s,
'''    await createReceiptTx(tx, { shopId, userId, purchase, requestKey: initialReceiptKey, requestFingerprint: initialReceiptFingerprint, receivedAt: new Date(), note: receiptMode === "FULL" ? "الاستلام الأول عند اعتماد الفاتورة" : "استلام جزئي عند اعتماد الفاتورة", lines: receiptLines });''',
'''    await createReceiptTx(tx, { shopId, userId, purchase, requestKey: initialReceiptKey, requestFingerprint: initialReceiptFingerprint, receivedAt: new Date(), warehouseId: receiptWarehouseId, note: receiptMode === "FULL" ? "الاستلام الأول عند اعتماد الفاتورة" : "استلام جزئي عند اعتماد الفاتورة", lines: receiptLines });''',
"initial receipt destination")

s = one(s,
'''  const fingerprint = requestFingerprint({
    purchaseId,
    receivedAt: receivedAt.toISOString(),
    reference: nullableText(input.reference),''',
'''  const warehouseId = nullableText(input.warehouseId);
  const fingerprint = requestFingerprint({
    purchaseId,
    warehouseId,
    receivedAt: receivedAt.toISOString(),
    reference: nullableText(input.reference),''',
"receipt fingerprint warehouse")

s = one(s,
'''    const id=await createReceiptTx(tx,{shopId,userId,purchase,requestKey,requestFingerprint:fingerprint,receivedAt,reference:input.reference,note:input.note,lines:receiptLines});''',
'''    const id=await createReceiptTx(tx,{shopId,userId,purchase,requestKey,requestFingerprint:fingerprint,receivedAt,warehouseId,reference:input.reference,note:input.note,lines:receiptLines});''',
"receipt call warehouse")

# Supplier return: fingerprint + warehouse resolution + persistence + stock source.
s = one(s,
'''  const fingerprint=requestFingerprint({purchaseId,reason,reference:nullableText(input.reference),returnedAt:returnedAt.toISOString(),shippingRefundAmount:shippingRefundValue.toFixed(2),settlementAdjustmentAmount:settlementAdjustmentValue.toFixed(2),settlementAdjustmentReason:adjustmentReason,lines:[...requested].map(([purchaseItemId,quantity])=>({purchaseItemId,quantity})).sort((a,b)=>a.purchaseItemId.localeCompare(b.purchaseItemId))});''',
'''  const warehouseId = nullableText(input.warehouseId);
  const fingerprint=requestFingerprint({purchaseId,warehouseId,reason,reference:nullableText(input.reference),returnedAt:returnedAt.toISOString(),shippingRefundAmount:shippingRefundValue.toFixed(2),settlementAdjustmentAmount:settlementAdjustmentValue.toFixed(2),settlementAdjustmentReason:adjustmentReason,lines:[...requested].map(([purchaseItemId,quantity])=>({purchaseItemId,quantity})).sort((a,b)=>a.purchaseItemId.localeCompare(b.purchaseItemId))});''',
"return fingerprint warehouse")

s = one(s,
'''    const returnRows=await tx.$queryRaw<Array<{id:string}>>`
      INSERT INTO "SupplierReturn" (
        "shopId","purchaseInvoiceId","supplierId","createdByUserId","requestKey","requestFingerprint","reason","reference","returnedAt",
        "baseSettlementValue","inventoryValue","shippingRefundValue","settlementAdjustmentValue","settlementAdjustmentReason","settlementAdjustedByUserId","totalValue"
      ) VALUES (
        ${shopId}::uuid,${purchaseId}::uuid,${purchase.supplierId}::uuid,${userId}::uuid,${requestKey},${fingerprint},${reason},${nullableText(input.reference)},${returnedAt},''',
'''    const warehouse = await resolvePurchaseWarehouseTx(tx, shopId, warehouseId);
    const returnRows=await tx.$queryRaw<Array<{id:string}>>`
      INSERT INTO "SupplierReturn" (
        "shopId","purchaseInvoiceId","supplierId","warehouseId","createdByUserId","requestKey","requestFingerprint","reason","reference","returnedAt",
        "baseSettlementValue","inventoryValue","shippingRefundValue","settlementAdjustmentValue","settlementAdjustmentReason","settlementAdjustedByUserId","totalValue"
      ) VALUES (
        ${shopId}::uuid,${purchaseId}::uuid,${purchase.supplierId}::uuid,${warehouse.id}::uuid,${userId}::uuid,${requestKey},${fingerprint},${reason},${nullableText(input.reference)},${returnedAt},''',
"return insert warehouse")

s = one(s,
'''    const supplierReturnId=returnRows[0]?.id;
    if(!supplierReturnId) throw new Error("تعذر إنشاء مرتجع المورد.");
    const warehouse = await ensureDefaultWarehouseTx(tx, shopId);

    for(const line of prepared){''',
'''    const supplierReturnId=returnRows[0]?.id;
    if(!supplierReturnId) throw new Error("تعذر إنشاء مرتجع المورد.");

    for(const line of prepared){''',
"remove forced default return warehouse")

s = one(s,
'''    SELECT r."id", r."receivedAt", r."reference", r."note", u."name" AS "createdByName"
    FROM "PurchaseReceipt" r LEFT JOIN "User" u ON u."id" = r."createdByUserId"''',
'''    SELECT r."id", r."receivedAt", r."warehouseId", w."name" AS "warehouseName", r."reference", r."note", u."name" AS "createdByName"
    FROM "PurchaseReceipt" r
    LEFT JOIN "User" u ON u."id" = r."createdByUserId"
    LEFT JOIN "Warehouse" w ON w."id" = r."warehouseId" AND w."shopId" = r."shopId"''',
"receipt detail query warehouse")

s = one(s,
'''    SELECT r."id", r."reason", r."reference", r."returnedAt", r."baseSettlementValue", r."inventoryValue", r."shippingRefundValue", r."settlementAdjustmentValue", r."settlementAdjustmentReason", r."totalValue", u."name" AS "createdByName"
    FROM "SupplierReturn" r LEFT JOIN "User" u ON u."id" = r."createdByUserId"''',
'''    SELECT r."id", r."reason", r."warehouseId", w."name" AS "warehouseName", r."reference", r."returnedAt", r."baseSettlementValue", r."inventoryValue", r."shippingRefundValue", r."settlementAdjustmentValue", r."settlementAdjustmentReason", r."totalValue", u."name" AS "createdByName"
    FROM "SupplierReturn" r
    LEFT JOIN "User" u ON u."id" = r."createdByUserId"
    LEFT JOIN "Warehouse" w ON w."id" = r."warehouseId" AND w."shopId" = r."shopId"''',
"return detail query warehouse")

p.write_text(s)

# -----------------------------------------------------------------------------
# Purchase actions.
# -----------------------------------------------------------------------------
p = Path("app/inventory/purchases/actions.ts")
s = p.read_text()

s = one(s,
'''  initialReceipt?: Array<{ sortOrder: number; quantity: number }>;
}) {''',
'''  initialReceipt?: Array<{ sortOrder: number; quantity: number }>;
  warehouseId?: string | null;
}) {''',
"post action input warehouse")

s = one(s,
'''      initialReceipt: z.array(z.object({ sortOrder: z.number().int().nonnegative(), quantity: z.number().int().nonnegative() })).max(250).optional(),
    }).parse(input);''',
'''      initialReceipt: z.array(z.object({ sortOrder: z.number().int().nonnegative(), quantity: z.number().int().nonnegative() })).max(250).optional(),
      warehouseId: z.string().uuid().nullable().optional(),
    }).parse(input);''',
"post action schema warehouse")

s = one(s,
'''      { receiptMode: parsed.receiptMode, initialReceipt: parsed.initialReceipt },''',
'''      { receiptMode: parsed.receiptMode, initialReceipt: parsed.initialReceipt, warehouseId: parsed.warehouseId },''',
"post action service warehouse")

s = one(s,
'''  receivedAt: string;
  reference?: string | null;''',
'''  receivedAt: string;
  warehouseId?: string | null;
  reference?: string | null;''',
"receipt action input warehouse")

s = one(s,
'''      receivedAt: operationDateSchema,
      reference: z.string().trim().max(180).nullable().optional(),''',
'''      receivedAt: operationDateSchema,
      warehouseId: z.string().uuid().nullable().optional(),
      reference: z.string().trim().max(180).nullable().optional(),''',
"receipt action schema warehouse")

s = one(s,
'''  reason: string;
  reference?: string | null;
  returnedAt: string;''',
'''  reason: string;
  warehouseId?: string | null;
  reference?: string | null;
  returnedAt: string;''',
"return action input warehouse")

s = one(s,
'''      reason: z.string().trim().min(2, "سبب المرتجع مطلوب").max(1000),
      reference: z.string().trim().max(180).nullable().optional(),''',
'''      reason: z.string().trim().min(2, "سبب المرتجع مطلوب").max(1000),
      warehouseId: z.string().uuid().nullable().optional(),
      reference: z.string().trim().max(180).nullable().optional(),''',
"return action schema warehouse")

p.write_text(s)

# -----------------------------------------------------------------------------
# New purchase page: ensure/list warehouses and pass them to the form.
# -----------------------------------------------------------------------------
p = Path("app/inventory/purchases/new/page.tsx")
s = p.read_text()
s = one(s,
'import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";\n',
'import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";\nimport { warehouseService } from "@/lib/services/warehouseService";\n',
"new purchase warehouse import")

s = one(s,
'''  const auth = await requirePermission("inventory:manage");
  const [suppliers, wallets, bankAccounts, drawerBalance, categories, draft] = await Promise.all([''',
'''  const auth = await requirePermission("inventory:manage");
  await warehouseService.ensureDefaultWarehouse(auth.shop.id);
  const [suppliers, wallets, bankAccounts, drawerBalance, categories, warehouses, draft] = await Promise.all([''',
"new purchase warehouse load header")

s = one(s,
'''    inventoryCategoryService.listInventoryCategories(auth.shop.id),
    params.draft ? purchaseReceivingService.getPurchaseInvoice(auth.shop.id, params.draft).catch(() => null) : Promise.resolve(null),''',
'''    inventoryCategoryService.listInventoryCategories(auth.shop.id),
    warehouseService.listWarehouses(auth.shop.id),
    params.draft ? purchaseReceivingService.getPurchaseInvoice(auth.shop.id, params.draft).catch(() => null) : Promise.resolve(null),''',
"new purchase warehouse promise")

s = one(s,
'''      categories={categories}
      currency={auth.shop.currency}''',
'''      categories={categories}
      warehouses={warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => ({ id: warehouse.id, name: warehouse.name, isDefault: warehouse.isDefault }))}
      currency={auth.shop.currency}''',
"new purchase warehouse prop")
p.write_text(s)

# -----------------------------------------------------------------------------
# Purchase form: select destination for initial receipt.
# -----------------------------------------------------------------------------
p = Path("app/inventory/purchases/_purchase-form.tsx")
s = p.read_text()

s = one(s,
'''  categories,
  currency,
  initialDraft,
}: {''',
'''  categories,
  warehouses,
  currency,
  initialDraft,
}: {''',
"purchase form warehouses destructure")

s = one(s,
'''  categories: CategoryOption[];
  currency: string;''',
'''  categories: CategoryOption[];
  warehouses: { id: string; name: string; isDefault: boolean }[];
  currency: string;''',
"purchase form warehouse prop type")

s = one(s,
'''  const [partialReceipt, setPartialReceipt] = useState(false);
  const [initialReceiptQuantities, setInitialReceiptQuantities] = useState<Record<string, string>>({});''',
'''  const [partialReceipt, setPartialReceipt] = useState(false);
  const [receiptWarehouseId, setReceiptWarehouseId] = useState(() => warehouses.find((warehouse) => warehouse.isDefault)?.id ?? warehouses[0]?.id ?? "");
  const [initialReceiptQuantities, setInitialReceiptQuantities] = useState<Record<string, string>>({});''',
"purchase form warehouse state")

s = one(s,
'''      receiptMode: partialReceipt ? "PARTIAL" : "FULL",
      initialReceipt: partialReceipt ? activeLines.map((line, sortOrder) => ({''',
'''      receiptMode: partialReceipt ? "PARTIAL" : "FULL",
      warehouseId: receiptWarehouseId || null,
      initialReceipt: partialReceipt ? activeLines.map((line, sortOrder) => ({''',
"post purchase warehouse payload")

section_marker = '''    <section className="rounded-3xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/20">
      <label className="flex cursor-pointer items-start gap-3">'''
section_new = '''    <section className="rounded-3xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/20">
      <label className="mb-4 grid gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200">
        مستودع استلام البضاعة
        <select value={receiptWarehouseId} onChange={(event) => setReceiptWarehouseId(event.target.value)} className="erp-input" required>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isDefault ? " — الرئيسي" : ""}</option>)}
        </select>
        <span className="text-[10px] font-semibold text-slate-400">كل الكميات التي تستلمها عند اعتماد هذه الفاتورة ستدخل لهذا المستودع.</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">'''
s = one(s, section_marker, section_new, "initial receipt warehouse UI")
p.write_text(s)

# -----------------------------------------------------------------------------
# Purchase detail page: warehouses + audit display.
# -----------------------------------------------------------------------------
p = Path("app/inventory/purchases/[id]/page.tsx")
s = p.read_text()
s = one(s,
'import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";\n',
'import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";\nimport { warehouseService } from "@/lib/services/warehouseService";\n',
"purchase detail warehouse import")

s = one(s,
'''  const [walletRows, bankAccountRows, paymentSources] = canManage && invoice.status === "POSTED"
    ? await Promise.all([
        purchaseReceivingService.listPurchaseFinancialWallets(auth.shop.id),
        bankAccountService.listAccounts(auth.shop.id),
        purchaseReceivingService.listPaymentSources(auth.shop.id),
      ])
    : [[], [], []];''',
'''  if (canManage && invoice.status === "POSTED") await warehouseService.ensureDefaultWarehouse(auth.shop.id);
  const [walletRows, bankAccountRows, paymentSources, warehouseRows] = canManage && invoice.status === "POSTED"
    ? await Promise.all([
        purchaseReceivingService.listPurchaseFinancialWallets(auth.shop.id),
        bankAccountService.listAccounts(auth.shop.id),
        purchaseReceivingService.listPaymentSources(auth.shop.id),
        warehouseService.listWarehouses(auth.shop.id),
      ])
    : [[], [], [], []];''',
"purchase detail warehouse load")

s = one(s,
'''<span className="text-xs font-black text-slate-700 dark:text-slate-200">{new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(receipt.receivedAt)}</span><span className="text-[10px] font-bold text-slate-400">{receipt.createdByName ? `بواسطة ${receipt.createdByName}` : ""}</span>''',
'''<span className="text-xs font-black text-slate-700 dark:text-slate-200">{new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(receipt.receivedAt)}</span><span className="text-[10px] font-bold text-slate-400">{[receipt.warehouseName ? `إلى ${receipt.warehouseName}` : null, receipt.createdByName ? `بواسطة ${receipt.createdByName}` : null].filter(Boolean).join(" • ")}</span>''',
"receipt warehouse audit display")

s = one(s,
'''{new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(supplierReturn.returnedAt)}{supplierReturn.createdByName ? ` • بواسطة ${supplierReturn.createdByName}` : ""}{supplierReturn.reference ? ` • مرجع ${supplierReturn.reference}` : ""}''',
'''{new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(supplierReturn.returnedAt)}{supplierReturn.warehouseName ? ` • من ${supplierReturn.warehouseName}` : ""}{supplierReturn.createdByName ? ` • بواسطة ${supplierReturn.createdByName}` : ""}{supplierReturn.reference ? ` • مرجع ${supplierReturn.reference}` : ""}''',
"return warehouse audit display")

s = one(s,
'''      paymentSources={paymentSources}
    />}''',
'''      paymentSources={paymentSources}
      warehouses={warehouseRows.filter((warehouse) => warehouse.isActive).map((warehouse) => ({ id: warehouse.id, name: warehouse.name, isDefault: warehouse.isDefault }))}
    />}''',
"purchase operations warehouses prop")
p.write_text(s)

# -----------------------------------------------------------------------------
# Purchase operations panel: select receipt destination / return source.
# -----------------------------------------------------------------------------
p = Path("app/inventory/purchases/_purchase-operations-panel.tsx")
s = p.read_text()

s = one(s,
'''type PaymentSourceRow = { id: string; name: string };
type AccountType =''',
'''type PaymentSourceRow = { id: string; name: string };
type WarehouseRow = { id: string; name: string; isDefault: boolean };
type AccountType =''',
"operations warehouse type")

s = one(s,
'''  bankAccounts,
  paymentSources,
}: {''',
'''  bankAccounts,
  paymentSources,
  warehouses,
}: {''',
"operations warehouse destructure")

s = one(s,
'''  bankAccounts: BankRow[];
  paymentSources: PaymentSourceRow[];
}) {''',
'''  bankAccounts: BankRow[];
  paymentSources: PaymentSourceRow[];
  warehouses: WarehouseRow[];
}) {''',
"operations warehouse prop type")

s = one(s,
'''  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [receiptDate, setReceiptDate] = useState(today());''',
'''  const defaultWarehouseId = warehouses.find((warehouse) => warehouse.isDefault)?.id ?? warehouses[0]?.id ?? "";
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [receiptWarehouseId, setReceiptWarehouseId] = useState(defaultWarehouseId);
  const [receiptDate, setReceiptDate] = useState(today());''',
"receipt warehouse state")

s = one(s,
'''  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");''',
'''  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnWarehouseId, setReturnWarehouseId] = useState(defaultWarehouseId);
  const [returnReason, setReturnReason] = useState("");''',
"return warehouse state")

s = one(s,
'''    receiptKey.current ??= requestKey();
    setReceiptBusy(true);''',
'''    if (!receiptWarehouseId) { setError("اختر مستودع استلام البضاعة."); return; }
    receiptKey.current ??= requestKey();
    setReceiptBusy(true);''',
"receipt require warehouse")

s = one(s,
'''      const result = await recordPurchaseReceiptAction({ purchaseId, requestKey: receiptKey.current, receivedAt: receiptDate, reference: receiptReference || null, note: receiptNote || null, lines });''',
'''      const result = await recordPurchaseReceiptAction({ purchaseId, requestKey: receiptKey.current, receivedAt: receiptDate, warehouseId: receiptWarehouseId, reference: receiptReference || null, note: receiptNote || null, lines });''',
"receipt submit warehouse")

s = one(s,
'''    if (!returnReason.trim()) { setError("سبب المرتجع مطلوب."); return; }
    returnKey.current ??= requestKey();''',
'''    if (!returnReason.trim()) { setError("سبب المرتجع مطلوب."); return; }
    if (!returnWarehouseId) { setError("اختر المستودع الذي ستخرج منه البضاعة المرتجعة."); return; }
    returnKey.current ??= requestKey();''',
"return require warehouse")

s = one(s,
'''      const result = await recordSupplierReturnAction({ purchaseId, requestKey: returnKey.current, reason: returnReason, reference: returnReference || null, returnedAt: returnDate, lines });''',
'''      const result = await recordSupplierReturnAction({ purchaseId, requestKey: returnKey.current, reason: returnReason, warehouseId: returnWarehouseId, reference: returnReference || null, returnedAt: returnDate, lines });''',
"return submit warehouse")

s = one(s,
'''          <div className="grid gap-2 sm:grid-cols-2"><Field label="تاريخ الاستلام"><input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="erp-input" /></Field><Field label="مرجع الاستلام (اختياري)"><input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} className="erp-input" /></Field></div>''',
'''          <Field label="مستودع الاستلام"><select value={receiptWarehouseId} onChange={(e) => setReceiptWarehouseId(e.target.value)} className="erp-input">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isDefault ? " — الرئيسي" : ""}</option>)}</select></Field>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="تاريخ الاستلام"><input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="erp-input" /></Field><Field label="مرجع الاستلام (اختياري)"><input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} className="erp-input" /></Field></div>''',
"receipt warehouse UI")

s = one(s,
'''          <Field label="سبب المرتجع *"><textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="erp-input min-h-20 resize-y" placeholder="مثال: عيب جودة / صنف خاطئ" /></Field>''',
'''          <Field label="المستودع المصدر"><select value={returnWarehouseId} onChange={(e) => setReturnWarehouseId(e.target.value)} className="erp-input">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isDefault ? " — الرئيسي" : ""}</option>)}</select></Field>
          <Field label="سبب المرتجع *"><textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="erp-input min-h-20 resize-y" placeholder="مثال: عيب جودة / صنف خاطئ" /></Field>''',
"return warehouse UI")
p.write_text(s)
