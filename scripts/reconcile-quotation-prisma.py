from pathlib import Path
from textwrap import dedent

schema_path = Path("prisma/schema.prisma")
schema = schema_path.read_text()


def replace_once(text, anchor, replacement, label):
    if text.count(anchor) != 1:
        raise SystemExit(f"{label}: anchor mismatch")
    return text.replace(anchor, replacement, 1)


if "model Quotation {" not in schema and "model CustomerApproval {" not in schema:
    schema = replace_once(
        schema,
        '  warehouses            Warehouse[] @relation("AutoWarehouseShop")\n',
        '  warehouses            Warehouse[] @relation("AutoWarehouseShop")\n'
        '  autoQuotations        Quotation[] @relation("AutoQuotationShop")\n'
        '  autoCustomerApprovals CustomerApproval[] @relation("AutoCustomerApprovalShop")\n',
        "Shop quotation relations",
    )
    schema = replace_once(
        schema,
        '  autoServiceLaborLines      ServiceLaborLine[] @relation("AutoServiceLaborTechnician")\n',
        '  autoServiceLaborLines      ServiceLaborLine[] @relation("AutoServiceLaborTechnician")\n'
        '  createdAutoQuotations      Quotation[] @relation("AutoQuotationCreator")\n'
        '  recordedAutoApprovals      CustomerApproval[] @relation("AutoCustomerApprovalRecorder")\n',
        "User quotation relations",
    )
    schema = replace_once(
        schema,
        '  partLines      ServicePartLine[] @relation("AutoServicePartOrder")\n',
        '  partLines      ServicePartLine[] @relation("AutoServicePartOrder")\n'
        '  quotations     Quotation[] @relation("AutoQuotationOrder")\n'
        '  customerApprovals CustomerApproval[] @relation("AutoCustomerApprovalOrder")\n',
        "ServiceOrder quotation relations",
    )

    models = dedent('''
    model Quotation {
      id              String    @id @default(uuid()) @db.Uuid
      shopId          String    @db.Uuid
      serviceOrderId  String    @db.Uuid
      quoteNumber     String    @db.Text
      revision        Int       @default(1)
      status          String    @default("DRAFT") @db.VarChar(24)
      subtotal        Decimal   @default(0) @db.Decimal(14, 2)
      discountTotal   Decimal   @default(0) @db.Decimal(14, 2)
      taxTotal        Decimal   @default(0) @db.Decimal(14, 2)
      total           Decimal   @default(0) @db.Decimal(14, 2)
      validUntil      DateTime? @db.Timestamptz(6)
      notes           String?   @db.Text
      sentAt          DateTime? @db.Timestamptz(6)
      createdByUserId String?   @db.Uuid
      createdAt       DateTime  @default(now()) @db.Timestamptz(6)
      updatedAt       DateTime  @default(now()) @db.Timestamptz(6)

      shop         Shop               @relation("AutoQuotationShop", fields: [shopId], references: [id], onDelete: Cascade, map: "Quotation_shopId_fkey")
      serviceOrder ServiceOrder       @relation("AutoQuotationOrder", fields: [shopId, serviceOrderId], references: [shopId, id], onDelete: Cascade, map: "Quotation_order_shop_fkey")
      createdBy    User?              @relation("AutoQuotationCreator", fields: [createdByUserId], references: [id], onDelete: SetNull, map: "Quotation_createdByUserId_fkey")
      approvals    CustomerApproval[] @relation("AutoCustomerApprovalQuotation")

      @@unique([shopId, id], map: "Quotation_shop_id_key")
      @@unique([shopId, quoteNumber], map: "Quotation_shop_quote_number_key")
      @@unique([serviceOrderId, revision], map: "Quotation_order_revision_key")
      @@index([shopId, serviceOrderId, revision(sort: Desc)], map: "Quotation_order_idx")
      @@index([shopId, status, createdAt(sort: Desc)], map: "Quotation_status_idx")
    }

    model CustomerApproval {
      id                    String   @id @default(uuid()) @db.Uuid
      shopId                String   @db.Uuid
      serviceOrderId        String   @db.Uuid
      quotationId           String   @db.Uuid
      decision              String   @db.VarChar(24)
      channel               String   @default("IN_PERSON") @db.VarChar(16)
      customerNameSnapshot  String?  @db.Text
      customerPhoneSnapshot String?  @db.Text
      note                  String?  @db.Text
      decidedAt             DateTime @default(now()) @db.Timestamptz(6)
      recordedByUserId      String?  @db.Uuid
      createdAt             DateTime @default(now()) @db.Timestamptz(6)

      shop         Shop         @relation("AutoCustomerApprovalShop", fields: [shopId], references: [id], onDelete: Cascade, map: "CustomerApproval_shopId_fkey")
      serviceOrder ServiceOrder @relation("AutoCustomerApprovalOrder", fields: [shopId, serviceOrderId], references: [shopId, id], onDelete: Cascade, map: "CustomerApproval_order_shop_fkey")
      quotation    Quotation    @relation("AutoCustomerApprovalQuotation", fields: [shopId, quotationId], references: [shopId, id], onDelete: Cascade, map: "CustomerApproval_quote_shop_fkey")
      recordedBy   User?        @relation("AutoCustomerApprovalRecorder", fields: [recordedByUserId], references: [id], onDelete: SetNull, map: "CustomerApproval_recordedByUserId_fkey")

      @@index([shopId, serviceOrderId, decidedAt(sort: Desc)], map: "CustomerApproval_order_idx")
      @@index([shopId, quotationId, decidedAt(sort: Desc)], map: "CustomerApproval_quote_idx")
    }

    ''')
    schema = replace_once(schema, "model RepairOrder {", models + "model RepairOrder {", "quotation model insertion")
    schema_path.write_text(schema)

service_path = Path("lib/services/autoServiceOrderService.ts")
service = service_path.read_text()

raw_quotes = '''prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "Quotation"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "revision" DESC
    `'''
prisma_quotes = '''prisma.quotation.findMany({
      where: { shopId, serviceOrderId },
      orderBy: { revision: "desc" },
    }).then((rows) => rows.map((row) => ({
      ...row,
      subtotal: Number(row.subtotal),
      discountTotal: Number(row.discountTotal),
      taxTotal: Number(row.taxTotal),
      total: Number(row.total),
    })))'''
if raw_quotes in service:
    service = service.replace(raw_quotes, prisma_quotes, 1)

raw_approvals = '''prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "CustomerApproval"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "decidedAt" DESC
    `'''
prisma_approvals = '''prisma.customerApproval.findMany({
      where: { shopId, serviceOrderId },
      orderBy: { decidedAt: "desc" },
    })'''
if raw_approvals in service:
    service = service.replace(raw_approvals, prisma_approvals, 1)

service_path.write_text(service)
