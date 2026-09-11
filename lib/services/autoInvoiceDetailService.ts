import { prisma } from "@/lib/prisma";

export type AutoInvoiceLaborLine = {
  id: string;
  description: string;
  quantity: number;
  hours: number | null;
  unitPrice: number;
  lineTotal: number;
  status: string;
  notes: string | null;
};

export type AutoInvoicePartLine = {
  id: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
  notes: string | null;
  warehouseName: string | null;
  sku: string | null;
};

export type AutoInvoiceServiceContext = {
  invoiceId: string;
  serviceOrderId: string;
  orderNumber: string;
  orderStatus: string;
  reportedIssue: string;
  diagnosis: string | null;
  finalTotal: number | null;
  receivedAt: Date;
  deliveredAt: Date | null;
  closedAt: Date | null;
  odometerAtIntake: number | null;
  odometerAtDelivery: number | null;
  deliveryNotes: string | null;
  vehicleId: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  plateNumber: string | null;
  vin: string | null;
  laborLines: AutoInvoiceLaborLine[];
  partLines: AutoInvoicePartLine[];
  laborTotal: number;
  partsTotal: number;
};

export async function getAutoInvoiceServiceContext(
  shopId: string,
  invoiceId: string,
): Promise<AutoInvoiceServiceContext | null> {
  const rows = await prisma.$queryRaw<Array<{
    invoiceId: string;
    serviceOrderId: string;
    orderNumber: string;
    orderStatus: string;
    reportedIssue: string;
    diagnosis: string | null;
    finalTotal: number | null;
    receivedAt: Date;
    deliveredAt: Date | null;
    closedAt: Date | null;
    odometerAtIntake: number | null;
    odometerAtDelivery: number | null;
    deliveryNotes: string | null;
    vehicleId: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number | null;
    plateNumber: string | null;
    vin: string | null;
  }>>`
    SELECT
      inv."id" AS "invoiceId",
      so."id" AS "serviceOrderId",
      so."orderNumber",
      so."status"::text AS "orderStatus",
      so."reportedIssue",
      so."diagnosis",
      so."finalTotal"::double precision AS "finalTotal",
      so."receivedAt",
      so."deliveredAt",
      so."closedAt",
      so."odometerAtIntake",
      so."odometerAtDelivery",
      so."deliveryNotes",
      v."id" AS "vehicleId",
      v."make" AS "vehicleMake",
      v."model" AS "vehicleModel",
      v."year" AS "vehicleYear",
      v."plateNumber",
      v."vin"
    FROM "Invoice" inv
    JOIN "ServiceOrder" so
      ON so."id" = inv."serviceOrderId"
     AND so."shopId" = inv."shopId"
     AND so."deletedAt" IS NULL
    JOIN "Vehicle" v
      ON v."id" = so."vehicleId"
     AND v."shopId" = so."shopId"
     AND v."deletedAt" IS NULL
    WHERE inv."id" = ${invoiceId}::uuid
      AND inv."shopId" = ${shopId}::uuid
      AND inv."deletedAt" IS NULL
      AND inv."serviceOrderId" IS NOT NULL
    LIMIT 1
  `;

  const header = rows[0];
  if (!header) return null;

  const [laborLines, partLines] = await Promise.all([
    prisma.$queryRaw<AutoInvoiceLaborLine[]>`
      SELECT
        "id",
        "description",
        "quantity"::double precision AS "quantity",
        "hours"::double precision AS "hours",
        "unitPrice"::double precision AS "unitPrice",
        "lineTotal"::double precision AS "lineTotal",
        "status",
        "notes"
      FROM "ServiceLaborLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${header.serviceOrderId}::uuid
        AND "status" <> 'CANCELLED'
      ORDER BY "sortOrder", "createdAt"
    `,
    prisma.$queryRaw<AutoInvoicePartLine[]>`
      SELECT
        spl."id",
        spl."partName",
        spl."quantity",
        spl."unitPrice"::double precision AS "unitPrice",
        spl."lineTotal"::double precision AS "lineTotal",
        spl."status",
        spl."notes",
        w."name" AS "warehouseName",
        ii."sku"
      FROM "ServicePartLine" spl
      LEFT JOIN "Warehouse" w
        ON w."id" = spl."warehouseId" AND w."shopId" = spl."shopId"
      LEFT JOIN "InventoryItem" ii
        ON ii."id" = spl."inventoryItemId" AND ii."shopId" = spl."shopId"
      WHERE spl."shopId" = ${shopId}::uuid
        AND spl."serviceOrderId" = ${header.serviceOrderId}::uuid
        AND spl."status" NOT IN ('CANCELLED', 'RETURNED')
      ORDER BY spl."sortOrder", spl."createdAt"
    `,
  ]);

  return {
    ...header,
    laborLines,
    partLines,
    laborTotal: laborLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    partsTotal: partLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
  };
}

export const autoInvoiceDetailService = {
  getAutoInvoiceServiceContext,
};
