import { prisma } from "@/lib/prisma";
import { serviceInspectionService, type ServiceInspectionRow } from "@/lib/services/serviceInspectionService";

export type AutoPrintLaborLine = {
  id: string;
  description: string;
  technicianName: string | null;
  hours: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
  notes: string | null;
};

export type AutoPrintPartLine = {
  id: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
  notes: string | null;
  warehouseName: string | null;
  sku: string | null;
  barcode: string | null;
};

export type AutoServiceOrderPrintData = {
  id: string;
  orderNumber: string;
  status: string;
  reportedIssue: string;
  receptionNotes: string | null;
  exteriorCondition: string | null;
  keysAndItems: string | null;
  diagnosis: string | null;
  resolutionNotes: string | null;
  odometerAtIntake: number | null;
  odometerAtDelivery: number | null;
  fuelLevelPercent: number | null;
  estimatedTotal: number | null;
  finalTotal: number | null;
  receivedAt: Date;
  promisedAt: Date | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleColor: string | null;
  plateNumber: string | null;
  vin: string | null;
  engineNumber: string | null;
  fuelType: string | null;
  transmission: string | null;
  receptionistName: string | null;
  technicianName: string | null;
  deliveredByName: string | null;
  closedByName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceTotal: number | null;
  invoiceAmountPaid: number | null;
  invoiceBalanceDue: number | null;
  quotationId: string | null;
  quotationNumber: string | null;
  quotationStatus: string | null;
  quotationTotal: number | null;
  laborLines: AutoPrintLaborLine[];
  partLines: AutoPrintPartLine[];
  inspections: ServiceInspectionRow[];
};

export type AutoQuotationPrintLine = {
  id: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountTotal: number;
  lineTotal: number;
  approvalStatus: string;
};

export type AutoQuotationPrintData = {
  id: string;
  serviceOrderId: string;
  quoteNumber: string;
  revision: number;
  status: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  validUntil: Date | null;
  notes: string | null;
  sentAt: Date | null;
  createdAt: Date;
  orderNumber: string;
  reportedIssue: string;
  diagnosis: string | null;
  odometerAtIntake: number | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleColor: string | null;
  plateNumber: string | null;
  vin: string | null;
  engineNumber: string | null;
  approvalDecision: string | null;
  approvalChannel: string | null;
  approvalNote: string | null;
  approvalDecidedAt: Date | null;
  approvalCustomerName: string | null;
  lines: AutoQuotationPrintLine[];
};

export async function getServiceOrderPrintData(shopId: string, serviceOrderId: string): Promise<AutoServiceOrderPrintData | null> {
  const rows = await prisma.$queryRaw<Array<Omit<AutoServiceOrderPrintData, "laborLines" | "partLines" | "inspections">>>`
    SELECT
      so."id", so."orderNumber", so."status", so."reportedIssue", so."receptionNotes",
      so."exteriorCondition", so."keysAndItems", so."diagnosis", so."resolutionNotes",
      so."odometerAtIntake", so."odometerAtDelivery",
      so."fuelLevelPercent"::double precision AS "fuelLevelPercent",
      so."estimatedTotal"::double precision AS "estimatedTotal",
      so."finalTotal"::double precision AS "finalTotal",
      so."receivedAt", so."promisedAt", so."deliveredAt", so."closedAt",
      c."name" AS "customerName", c."phone" AS "customerPhone", c."email" AS "customerEmail",
      v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear",
      v."color" AS "vehicleColor", v."plateNumber", v."vin", v."engineNumber", v."fuelType", v."transmission",
      receptionist."name" AS "receptionistName",
      technician."name" AS "technicianName",
      delivered_by."name" AS "deliveredByName",
      closed_by."name" AS "closedByName",
      inv."id" AS "invoiceId", inv."invoiceNumber", inv."status" AS "invoiceStatus",
      inv."total" AS "invoiceTotal", inv."amountPaid" AS "invoiceAmountPaid", inv."balanceDue" AS "invoiceBalanceDue",
      q."id" AS "quotationId", q."quoteNumber" AS "quotationNumber", q."status" AS "quotationStatus", q."total" AS "quotationTotal"
    FROM "ServiceOrder" so
    JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
    JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    LEFT JOIN "User" receptionist ON receptionist."id" = so."receptionistUserId"
    LEFT JOIN "User" technician ON technician."id" = so."assignedToUserId"
    LEFT JOIN "User" delivered_by ON delivered_by."id" = so."deliveredByUserId"
    LEFT JOIN "User" closed_by ON closed_by."id" = so."closedByUserId"
    LEFT JOIN LATERAL (
      SELECT i."id", i."invoiceNumber", i."status"::text AS "status",
             i."total"::double precision AS "total",
             i."amountPaid"::double precision AS "amountPaid",
             i."balanceDue"::double precision AS "balanceDue"
      FROM "Invoice" i
      WHERE i."shopId" = so."shopId"
        AND i."serviceOrderId" = so."id"
        AND i."deletedAt" IS NULL
        AND i."status" <> 'VOID'::"InvoiceStatus"
      ORDER BY i."issuedAt" DESC
      LIMIT 1
    ) inv ON TRUE
    LEFT JOIN LATERAL (
      SELECT q1."id", q1."quoteNumber", q1."status", q1."total"::double precision AS "total"
      FROM "Quotation" q1
      WHERE q1."shopId" = so."shopId" AND q1."serviceOrderId" = so."id"
      ORDER BY q1."revision" DESC, q1."createdAt" DESC
      LIMIT 1
    ) q ON TRUE
    WHERE so."id" = ${serviceOrderId}::uuid
      AND so."shopId" = ${shopId}::uuid
      AND so."deletedAt" IS NULL
    LIMIT 1
  `;

  const order = rows[0];
  if (!order) return null;

  const [laborLines, partLines, inspections] = await Promise.all([
    prisma.$queryRaw<AutoPrintLaborLine[]>`
      SELECT l."id", l."description", technician."name" AS "technicianName",
             l."hours"::double precision AS "hours",
             l."quantity"::double precision AS "quantity",
             l."unitPrice"::double precision AS "unitPrice",
             l."lineTotal"::double precision AS "lineTotal",
             l."status", l."notes"
      FROM "ServiceLaborLine" l
      LEFT JOIN "User" technician ON technician."id" = l."technicianUserId"
      WHERE l."shopId" = ${shopId}::uuid AND l."serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY l."sortOrder", l."createdAt"
    `,
    prisma.$queryRaw<AutoPrintPartLine[]>`
      SELECT p."id", p."partName", p."quantity",
             p."unitPrice"::double precision AS "unitPrice",
             p."lineTotal"::double precision AS "lineTotal",
             p."status", p."notes", w."name" AS "warehouseName", item."sku", item."barcode"
      FROM "ServicePartLine" p
      LEFT JOIN "Warehouse" w ON w."id" = p."warehouseId" AND w."shopId" = p."shopId"
      LEFT JOIN "InventoryItem" item ON item."id" = p."inventoryItemId" AND item."shopId" = p."shopId"
      WHERE p."shopId" = ${shopId}::uuid AND p."serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY p."sortOrder", p."createdAt"
    `,
    serviceInspectionService.listServiceInspections(shopId, serviceOrderId),
  ]);

  return { ...order, laborLines, partLines, inspections };
}

export async function getQuotationPrintData(shopId: string, quotationId: string): Promise<AutoQuotationPrintData | null> {
  const rows = await prisma.$queryRaw<Array<Omit<AutoQuotationPrintData, "lines">>>`
    SELECT
      q."id", q."serviceOrderId", q."quoteNumber", q."revision", q."status",
      q."subtotal"::double precision AS "subtotal",
      q."discountTotal"::double precision AS "discountTotal",
      q."taxTotal"::double precision AS "taxTotal",
      q."total"::double precision AS "total",
      q."validUntil", q."notes", q."sentAt", q."createdAt",
      so."orderNumber", so."reportedIssue", so."diagnosis", so."odometerAtIntake",
      c."name" AS "customerName", c."phone" AS "customerPhone", c."email" AS "customerEmail",
      v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear",
      v."color" AS "vehicleColor", v."plateNumber", v."vin", v."engineNumber",
      approval."decision" AS "approvalDecision", approval."channel" AS "approvalChannel",
      approval."note" AS "approvalNote", approval."decidedAt" AS "approvalDecidedAt",
      approval."customerNameSnapshot" AS "approvalCustomerName"
    FROM "Quotation" q
    JOIN "ServiceOrder" so ON so."id" = q."serviceOrderId" AND so."shopId" = q."shopId"
    JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
    JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    LEFT JOIN LATERAL (
      SELECT ca."decision", ca."channel", ca."note", ca."decidedAt", ca."customerNameSnapshot"
      FROM "CustomerApproval" ca
      WHERE ca."shopId" = q."shopId" AND ca."quotationId" = q."id"
      ORDER BY ca."decidedAt" DESC
      LIMIT 1
    ) approval ON TRUE
    WHERE q."id" = ${quotationId}::uuid AND q."shopId" = ${shopId}::uuid
    LIMIT 1
  `;

  const quote = rows[0];
  if (!quote) return null;

  const lines = await prisma.$queryRaw<AutoQuotationPrintLine[]>`
    SELECT "id", "lineType", "description",
           "quantity"::double precision AS "quantity",
           "unitPrice"::double precision AS "unitPrice",
           "discountTotal"::double precision AS "discountTotal",
           "lineTotal"::double precision AS "lineTotal",
           "approvalStatus"
    FROM "QuotationLine"
    WHERE "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
    ORDER BY "sortOrder", "createdAt"
  `;

  return { ...quote, lines };
}

export const autoPrintService = {
  getServiceOrderPrintData,
  getQuotationPrintData,
};
