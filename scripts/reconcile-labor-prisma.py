from pathlib import Path
from textwrap import dedent
import re

schema_path = Path("prisma/schema.prisma")
schema = schema_path.read_text()

def replace_once(text, anchor, replacement, label):
    if text.count(anchor) != 1:
        raise SystemExit(f"{label}: anchor mismatch")
    return text.replace(anchor, replacement, 1)

if "model ServiceLaborLine {" not in schema:
    schema = replace_once(
        schema,
        '  autoServiceInspectionItems ServiceInspectionItem[] @relation("AutoServiceInspectionItemShop")\n',
        '  autoServiceInspectionItems ServiceInspectionItem[] @relation("AutoServiceInspectionItemShop")\n  autoServiceLaborLines ServiceLaborLine[] @relation("AutoServiceLaborShop")\n',
        "Shop labor relation",
    )
    schema = replace_once(
        schema,
        '  autoServiceInspections     ServiceInspection[] @relation("AutoServiceInspectionInspector")\n',
        '  autoServiceInspections     ServiceInspection[] @relation("AutoServiceInspectionInspector")\n  autoServiceLaborLines      ServiceLaborLine[] @relation("AutoServiceLaborTechnician")\n',
        "User labor relation",
    )
    schema = replace_once(
        schema,
        '  inspections    ServiceInspection[] @relation("AutoServiceInspectionOrder")\n',
        '  inspections    ServiceInspection[] @relation("AutoServiceInspectionOrder")\n  laborLines     ServiceLaborLine[] @relation("AutoServiceLaborOrder")\n',
        "ServiceOrder labor relation",
    )
    model = dedent('''
    model ServiceLaborLine {
      id               String    @id @default(uuid()) @db.Uuid
      shopId           String    @db.Uuid
      serviceOrderId   String    @db.Uuid
      description      String    @db.Text
      technicianUserId String?   @db.Uuid
      hours            Decimal?  @db.Decimal(8, 2)
      quantity         Decimal   @default(1) @db.Decimal(10, 2)
      unitPrice        Decimal   @default(0) @db.Decimal(14, 2)
      costAmount       Decimal?  @db.Decimal(14, 2)
      lineTotal        Decimal   @default(0) @db.Decimal(14, 2)
      status           String    @default("PLANNED") @db.VarChar(16)
      notes            String?   @db.Text
      sortOrder        Int       @default(0)
      createdAt        DateTime  @default(now()) @db.Timestamptz(6)
      updatedAt        DateTime  @default(now()) @db.Timestamptz(6)

      shop         Shop         @relation("AutoServiceLaborShop", fields: [shopId], references: [id], onDelete: Cascade, map: "ServiceLaborLine_shopId_fkey")
      serviceOrder ServiceOrder @relation("AutoServiceLaborOrder", fields: [shopId, serviceOrderId], references: [shopId, id], onDelete: Cascade, map: "ServiceLaborLine_order_shop_fkey")
      technician   User?        @relation("AutoServiceLaborTechnician", fields: [technicianUserId], references: [id], onDelete: SetNull, map: "ServiceLaborLine_technicianUserId_fkey")

      @@unique([shopId, id], map: "ServiceLaborLine_shop_id_key")
      @@index([shopId, serviceOrderId, sortOrder], map: "ServiceLaborLine_order_idx")
      @@index([shopId, technicianUserId, status], map: "ServiceLaborLine_technician_idx")
    }

    ''')
    schema = replace_once(schema, "model RepairOrder {", model + "model RepairOrder {", "labor model insertion")
    schema_path.write_text(schema)

service_path = Path("lib/services/autoServiceOrderService.ts")
service = service_path.read_text()
raw = '''prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "ServiceLaborLine"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "sortOrder", "createdAt"
    `'''
replacement = '''prisma.serviceLaborLine.findMany({
      where: { shopId, serviceOrderId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }).then((rows) => rows.map((row) => ({
      ...row,
      hours: row.hours == null ? null : Number(row.hours),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
      costAmount: row.costAmount == null ? null : Number(row.costAmount),
      lineTotal: Number(row.lineTotal),
    })))'''
if raw in service:
    service = service.replace(raw, replacement, 1)

pattern = re.compile(r'async function assertOrderEditable\(shopId: string, serviceOrderId: string\) \{.*?\n\}\n\nexport async function addLaborLine', re.S)
if 'SELECT "status" FROM "ServiceOrder"' in service:
    replacement = '''async function assertOrderEditable(shopId: string, serviceOrderId: string) {
  const order = await prisma.serviceOrder.findFirst({
    where: { id: serviceOrderId, shopId, deletedAt: null },
    select: { status: true },
  });
  if (!order) throw new Error("أمر الصيانة غير موجود.");
  const status = order.status as ServiceOrderStatus;
  if (FINAL_STATUSES.has(status) || status === "DELIVERED") {
    throw new Error("لا يمكن تعديل بنود أمر صيانة منتهي أو ملغى.");
  }
}

export async function addLaborLine'''
    service, count = pattern.subn(replacement, service, count=1)
    if count != 1:
        raise SystemExit("assertOrderEditable replacement failed")
service_path.write_text(service)
