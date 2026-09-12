from pathlib import Path
from textwrap import dedent

schema_path = Path("prisma/schema.prisma")
schema = schema_path.read_text()


def replace_once(text, anchor, replacement, label):
    if text.count(anchor) != 1:
        raise SystemExit(f"{label}: anchor mismatch")
    return text.replace(anchor, replacement, 1)


if "model QuotationLine {" not in schema:
    schema = replace_once(
        schema,
        '  autoCustomerApprovals CustomerApproval[] @relation("AutoCustomerApprovalShop")\n',
        '  autoCustomerApprovals CustomerApproval[] @relation("AutoCustomerApprovalShop")\n'
        '  autoQuotationLines     QuotationLine[] @relation("AutoQuotationLineShop")\n',
        "Shop quotation line relation",
    )
    schema = replace_once(
        schema,
        '  autoServicePartLines     ServicePartLine[] @relation("AutoServicePartInventoryItem")\n',
        '  autoServicePartLines     ServicePartLine[] @relation("AutoServicePartInventoryItem")\n'
        '  autoQuotationLines       QuotationLine[] @relation("AutoQuotationLineInventoryItem")\n',
        "InventoryItem quotation line relation",
    )
    schema = replace_once(
        schema,
        '  approvals    CustomerApproval[] @relation("AutoCustomerApprovalQuotation")\n',
        '  approvals    CustomerApproval[] @relation("AutoCustomerApprovalQuotation")\n'
        '  lines        QuotationLine[] @relation("AutoQuotationLines")\n',
        "Quotation line relation",
    )

    model = dedent('''
    model QuotationLine {
      id                 String    @id @default(uuid()) @db.Uuid
      shopId             String    @db.Uuid
      quotationId        String    @db.Uuid
      lineType           String    @default("LABOR") @db.VarChar(12)
      description        String    @db.Text
      inventoryItemId    String?   @db.Uuid
      serviceLaborLineId String?   @db.Uuid
      servicePartLineId  String?   @db.Uuid
      quantity           Decimal   @default(1) @db.Decimal(12, 2)
      unitCost           Decimal?  @db.Decimal(18, 6)
      unitPrice          Decimal   @default(0) @db.Decimal(14, 2)
      discountTotal      Decimal   @default(0) @db.Decimal(14, 2)
      lineTotal          Decimal   @default(0) @db.Decimal(14, 2)
      approvalStatus     String    @default("PENDING") @db.VarChar(12)
      sortOrder          Int       @default(0)
      createdAt          DateTime  @default(now()) @db.Timestamptz(6)
      updatedAt          DateTime  @default(now()) @db.Timestamptz(6)

      shop          Shop           @relation("AutoQuotationLineShop", fields: [shopId], references: [id], onDelete: Cascade, map: "QuotationLine_shopId_fkey")
      quotation     Quotation      @relation("AutoQuotationLines", fields: [shopId, quotationId], references: [shopId, id], onDelete: Cascade, map: "QuotationLine_quote_shop_fkey")
      inventoryItem InventoryItem? @relation("AutoQuotationLineInventoryItem", fields: [inventoryItemId], references: [id], onDelete: SetNull, map: "QuotationLine_inventoryItemId_fkey")

      // The database also has composite FKs (shopId, serviceLaborLineId) and
      // (shopId, servicePartLineId) with ON DELETE SET NULL. Because shopId is
      // required, those referential actions cannot be represented faithfully as
      // Prisma relations without changing semantics. Keep these UUIDs as scalar
      // references; PostgreSQL remains authoritative for those two constraints.

      @@index([shopId, quotationId, sortOrder], map: "QuotationLine_quote_idx")
    }

    ''')
    schema = replace_once(schema, "model CustomerApproval {", model + "model CustomerApproval {", "QuotationLine model insertion")
    schema_path.write_text(schema)

service_path = Path("lib/services/quotationService.ts")
service = service_path.read_text()
service = service.replace(
    'export type ApprovalChannel = "IN_PERSON" | "PHONE" | "WHATSAPP" | "WEB" | "OTHER";',
    'export type ApprovalChannel = "IN_PERSON" | "PHONE" | "WHATSAPP" | "EMAIL" | "OTHER";',
)

old_get = '''export async function getQuotation(shopId: string, quotationId: string) {
  const quotes = await prisma.$queryRaw<Array<Record<string, unknown>> & { serviceOrderId?: never }>`
    SELECT q.*, so."orderNumber", c."name" AS "customerName", c."phone" AS "customerPhone",
           v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear", v."plateNumber", v."vin"
    FROM "Quotation" q
    JOIN "ServiceOrder" so ON so."id" = q."serviceOrderId" AND so."shopId" = q."shopId"
    JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
    WHERE q."id" = ${quotationId}::uuid AND q."shopId" = ${shopId}::uuid
    LIMIT 1
  `;
  const quote = quotes[0];
  if (!quote) return null;

  const lines = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "QuotationLine"
    WHERE "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
    ORDER BY "sortOrder", "createdAt"
  `;
  return { ...quote, lines };
}'''

new_get = '''export async function getQuotation(shopId: string, quotationId: string) {
  const quote = await prisma.quotation.findFirst({
    where: { id: quotationId, shopId },
    include: {
      serviceOrder: {
        select: {
          orderNumber: true,
          customer: { select: { shopId: true, name: true, phone: true } },
          vehicle: { select: { make: true, model: true, year: true, plateNumber: true, vin: true } },
        },
      },
    },
  });
  if (!quote || quote.serviceOrder.customer.shopId !== shopId) return null;

  const lines = await prisma.quotationLine.findMany({
    where: { shopId, quotationId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const { serviceOrder, ...quoteData } = quote;
  return {
    ...quoteData,
    subtotal: Number(quote.subtotal),
    discountTotal: Number(quote.discountTotal),
    taxTotal: Number(quote.taxTotal),
    total: Number(quote.total),
    orderNumber: serviceOrder.orderNumber,
    customerName: serviceOrder.customer.name,
    customerPhone: serviceOrder.customer.phone,
    vehicleMake: serviceOrder.vehicle.make,
    vehicleModel: serviceOrder.vehicle.model,
    vehicleYear: serviceOrder.vehicle.year,
    plateNumber: serviceOrder.vehicle.plateNumber,
    vin: serviceOrder.vehicle.vin,
    lines: lines.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      unitCost: line.unitCost == null ? null : Number(line.unitCost),
      unitPrice: Number(line.unitPrice),
      discountTotal: Number(line.discountTotal),
      lineTotal: Number(line.lineTotal),
    })),
  };
}'''

if old_get not in service:
    raise SystemExit("getQuotation raw block not found")
service = service.replace(old_get, new_get, 1)
service_path.write_text(service)

actions_path = Path("app/service-orders/actions.ts")
actions = actions_path.read_text()
actions = actions.replace(
    'z.enum(["IN_PERSON", "PHONE", "WHATSAPP", "WEB", "OTHER"])',
    'z.enum(["IN_PERSON", "PHONE", "WHATSAPP", "EMAIL", "OTHER"])',
)
actions_path.write_text(actions)
