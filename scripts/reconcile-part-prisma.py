from pathlib import Path
from textwrap import dedent

schema_path = Path("prisma/schema.prisma")
schema = schema_path.read_text()

def replace_once(text, anchor, replacement, label):
    if text.count(anchor) != 1:
        raise SystemExit(f"{label}: anchor mismatch")
    return text.replace(anchor, replacement, 1)

if "model Warehouse {" not in schema and "model ServicePartLine {" not in schema:
    schema = replace_once(
        schema,
        '  autoServiceLaborLines ServiceLaborLine[] @relation("AutoServiceLaborShop")\n',
        '  autoServiceLaborLines ServiceLaborLine[] @relation("AutoServiceLaborShop")\n  autoServicePartLines  ServicePartLine[] @relation("AutoServicePartShop")\n  warehouses            Warehouse[] @relation("AutoWarehouseShop")\n',
        "Shop warehouse/part relations",
    )
    schema = replace_once(
        schema,
        '  laborLines     ServiceLaborLine[] @relation("AutoServiceLaborOrder")\n',
        '  laborLines     ServiceLaborLine[] @relation("AutoServiceLaborOrder")\n  partLines      ServicePartLine[] @relation("AutoServicePartOrder")\n',
        "ServiceOrder part relation",
    )
    schema = replace_once(
        schema,
        '  compatibilityGroupLinks InventoryCompatibilityGroup[]\n',
        '  compatibilityGroupLinks InventoryCompatibilityGroup[]\n  autoServicePartLines     ServicePartLine[] @relation("AutoServicePartInventoryItem")\n',
        "InventoryItem part relation",
    )
    models = dedent('''
    model Warehouse {
      id        String    @id @default(uuid()) @db.Uuid
      shopId    String    @db.Uuid
      code      String?   @db.VarChar(40)
      name      String    @db.Text
      location  String?   @db.Text
      isDefault Boolean   @default(false)
      isActive  Boolean   @default(true)
      createdAt DateTime  @default(now()) @db.Timestamptz(6)
      updatedAt DateTime  @default(now()) @db.Timestamptz(6)
      deletedAt DateTime? @db.Timestamptz(6)

      shop             Shop              @relation("AutoWarehouseShop", fields: [shopId], references: [id], onDelete: Cascade, map: "Warehouse_shopId_fkey")
      servicePartLines ServicePartLine[] @relation("AutoServicePartWarehouse")

      @@unique([shopId, id], map: "Warehouse_shop_id_key")
      @@index([shopId, isActive, createdAt], map: "Warehouse_shop_active_idx")
    }

    model ServicePartLine {
      id              String    @id @default(uuid()) @db.Uuid
      shopId          String    @db.Uuid
      serviceOrderId  String    @db.Uuid
      inventoryItemId String?   @db.Uuid
      partName        String    @db.Text
      quantity        Int       @default(1)
      unitCost        Decimal?  @db.Decimal(18, 6)
      unitPrice       Decimal   @default(0) @db.Decimal(14, 2)
      lineTotal       Decimal   @default(0) @db.Decimal(14, 2)
      status          String    @default("PLANNED") @db.VarChar(16)
      notes           String?   @db.Text
      sortOrder       Int       @default(0)
      createdAt       DateTime  @default(now()) @db.Timestamptz(6)
      updatedAt       DateTime  @default(now()) @db.Timestamptz(6)
      warehouseId     String?   @db.Uuid

      shop          Shop           @relation("AutoServicePartShop", fields: [shopId], references: [id], onDelete: Cascade, map: "ServicePartLine_shopId_fkey")
      serviceOrder  ServiceOrder   @relation("AutoServicePartOrder", fields: [shopId, serviceOrderId], references: [shopId, id], onDelete: Cascade, map: "ServicePartLine_order_shop_fkey")
      inventoryItem InventoryItem? @relation("AutoServicePartInventoryItem", fields: [inventoryItemId], references: [id], onDelete: SetNull, map: "ServicePartLine_inventoryItemId_fkey")
      warehouse     Warehouse?     @relation("AutoServicePartWarehouse", fields: [shopId, warehouseId], references: [shopId, id], onDelete: Restrict, map: "ServicePartLine_warehouse_shop_fkey")

      @@unique([shopId, id], map: "ServicePartLine_shop_id_key")
      @@index([shopId, serviceOrderId, sortOrder], map: "ServicePartLine_order_idx")
      @@index([shopId, inventoryItemId], map: "ServicePartLine_inventory_idx")
      @@index([warehouseId], map: "ServicePartLine_warehouse_idx")
    }

    ''')
    schema = replace_once(schema, "model RepairOrder {", models + "model RepairOrder {", "Warehouse/part model insertion")
    schema_path.write_text(schema)

service_path = Path("lib/services/autoServiceOrderService.ts")
service = service_path.read_text()
raw = '''prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT spl.*, w."name" AS "warehouseName", i."sku", i."barcode"
      FROM "ServicePartLine" spl
      LEFT JOIN "Warehouse" w
        ON w."id" = spl."warehouseId" AND w."shopId" = spl."shopId"
      LEFT JOIN "InventoryItem" i
        ON i."id" = spl."inventoryItemId" AND i."shopId" = spl."shopId"
      WHERE spl."shopId" = ${shopId}::uuid AND spl."serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY spl."sortOrder", spl."createdAt"
    `'''
replacement = '''prisma.servicePartLine.findMany({
      where: { shopId, serviceOrderId },
      select: {
        id: true,
        shopId: true,
        serviceOrderId: true,
        inventoryItemId: true,
        partName: true,
        quantity: true,
        unitCost: true,
        unitPrice: true,
        lineTotal: true,
        status: true,
        notes: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        inventoryItem: { select: { shopId: true, sku: true, barcode: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }).then((rows) => rows.map(({ warehouse, inventoryItem, ...line }) => {
      const sameShopInventory = inventoryItem?.shopId === line.shopId ? inventoryItem : null;
      return {
        ...line,
        unitCost: line.unitCost == null ? null : Number(line.unitCost),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        warehouseName: warehouse?.name ?? null,
        sku: sameShopInventory?.sku ?? null,
        barcode: sameShopInventory?.barcode ?? null,
      };
    }))'''
if raw in service:
    service = service.replace(raw, replacement, 1)
service_path.write_text(service)
