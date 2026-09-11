import { prisma } from "@/lib/prisma";

export type VehicleHistoryLaborLine = { id: string; serviceOrderId: string; description: string; technicianName: string | null; hours: number | null; quantity: number; unitPrice: number; lineTotal: number; status: string; notes: string | null };
export type VehicleHistoryPartLine = { id: string; serviceOrderId: string; partName: string; quantity: number; unitPrice: number; lineTotal: number; status: string; notes: string | null; warehouseName: string | null; sku: string | null };
export type VehicleHistoryInspection = { id: string; serviceOrderId: string; inspectionType: string; status: string; summary: string | null; inspectorName: string | null; inspectedAt: Date | null; createdAt: Date };
export type VehicleHistoryQuotation = { id: string; serviceOrderId: string; quoteNumber: string; revision: number; status: string; subtotal: number; discountTotal: number; taxTotal: number; total: number; validUntil: Date | null; notes: string | null; sentAt: Date | null; createdAt: Date };
export type VehicleHistoryApproval = { id: string; serviceOrderId: string; quotationId: string | null; decision: string; channel: string | null; customerNameSnapshot: string | null; note: string | null; decidedAt: Date; recordedByName: string | null };
export type VehicleHistoryPayment = { id: string; serviceOrderId: string; invoiceId: string; amount: number; method: string; sourceName: string | null; reference: string | null; note: string | null; paidAt: Date };

export type VehicleHistoryOrder = {
  id: string; orderNumber: string; status: string; reportedIssue: string; receptionNotes: string | null; diagnosis: string | null;
  resolutionNotes: string | null; deliveryNotes: string | null; odometerAtIntake: number | null; odometerAtDelivery: number | null;
  estimatedTotal: number | null; finalTotal: number | null; receivedAt: Date; promisedAt: Date | null; approvedAt: Date | null;
  startedAt: Date | null; readyAt: Date | null; deliveredAt: Date | null; closedAt: Date | null;
  assignedTechnicianName: string | null; receptionistName: string | null; deliveredByName: string | null; closedByName: string | null;
  invoiceId: string | null; invoiceNumber: string | null; invoiceStatus: string | null; invoiceTotal: number | null;
  invoiceAmountPaid: number | null; invoiceBalanceDue: number | null; invoiceIssuedAt: Date | null;
  laborLines: VehicleHistoryLaborLine[]; partLines: VehicleHistoryPartLine[]; inspections: VehicleHistoryInspection[];
  quotations: VehicleHistoryQuotation[]; approvals: VehicleHistoryApproval[]; payments: VehicleHistoryPayment[];
};

export type VehicleLifetimeHistory = {
  metrics: { visitCount: number; completedVisitCount: number; firstServiceAt: Date | null; lastServiceAt: Date | null; lastRecordedOdometer: number | null; invoicedTotal: number; paidTotal: number; outstandingTotal: number; laborTotal: number; partsTotal: number };
  orders: VehicleHistoryOrder[];
};

function groupByOrder<T extends { serviceOrderId: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const current = map.get(row.serviceOrderId);
    if (current) current.push(row); else map.set(row.serviceOrderId, [row]);
  }
  return map;
}

export async function getVehicleLifetimeHistory(shopId: string, vehicleId: string): Promise<VehicleLifetimeHistory> {
  const [orders, laborLines, partLines, inspections, quotations, approvals, payments] = await Promise.all([
    prisma.$queryRaw<Array<Omit<VehicleHistoryOrder, "laborLines" | "partLines" | "inspections" | "quotations" | "approvals" | "payments">>>`
      SELECT so."id", so."orderNumber", so."status", so."reportedIssue", so."receptionNotes", so."diagnosis",
             so."resolutionNotes", so."deliveryNotes", so."odometerAtIntake", so."odometerAtDelivery",
             so."estimatedTotal"::double precision AS "estimatedTotal", so."finalTotal"::double precision AS "finalTotal",
             so."receivedAt", so."promisedAt", so."approvedAt", so."startedAt", so."readyAt", so."deliveredAt", so."closedAt",
             assigned."name" AS "assignedTechnicianName", receptionist."name" AS "receptionistName",
             delivered_by."name" AS "deliveredByName", closed_by."name" AS "closedByName",
             inv."id" AS "invoiceId", inv."invoiceNumber", inv."status"::text AS "invoiceStatus",
             inv."total"::double precision AS "invoiceTotal", inv."amountPaid"::double precision AS "invoiceAmountPaid",
             inv."balanceDue"::double precision AS "invoiceBalanceDue", inv."issuedAt" AS "invoiceIssuedAt"
      FROM "ServiceOrder" so
      LEFT JOIN "User" assigned ON assigned."id" = so."assignedToUserId"
      LEFT JOIN "User" receptionist ON receptionist."id" = so."receptionistUserId"
      LEFT JOIN "User" delivered_by ON delivered_by."id" = so."deliveredByUserId"
      LEFT JOIN "User" closed_by ON closed_by."id" = so."closedByUserId"
      LEFT JOIN LATERAL (
        SELECT i."id", i."invoiceNumber", i."status", i."total", i."amountPaid", i."balanceDue", i."issuedAt"
        FROM "Invoice" i
        WHERE i."shopId" = so."shopId" AND i."serviceOrderId" = so."id" AND i."deletedAt" IS NULL AND i."status" <> 'VOID'::"InvoiceStatus"
        ORDER BY i."issuedAt" DESC LIMIT 1
      ) inv ON TRUE
      WHERE so."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
      ORDER BY so."receivedAt" DESC
    `,
    prisma.$queryRaw<VehicleHistoryLaborLine[]>`
      SELECT l."id", l."serviceOrderId", l."description", technician."name" AS "technicianName",
             l."hours"::double precision AS "hours", l."quantity"::double precision AS "quantity",
             l."unitPrice"::double precision AS "unitPrice", l."lineTotal"::double precision AS "lineTotal", l."status", l."notes"
      FROM "ServiceLaborLine" l
      JOIN "ServiceOrder" so ON so."id" = l."serviceOrderId" AND so."shopId" = l."shopId"
      LEFT JOIN "User" technician ON technician."id" = l."technicianUserId"
      WHERE l."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
      ORDER BY l."serviceOrderId", l."sortOrder", l."createdAt"
    `,
    prisma.$queryRaw<VehicleHistoryPartLine[]>`
      SELECT p."id", p."serviceOrderId", p."partName", p."quantity", p."unitPrice"::double precision AS "unitPrice",
             p."lineTotal"::double precision AS "lineTotal", p."status", p."notes", w."name" AS "warehouseName", item."sku"
      FROM "ServicePartLine" p
      JOIN "ServiceOrder" so ON so."id" = p."serviceOrderId" AND so."shopId" = p."shopId"
      LEFT JOIN "Warehouse" w ON w."id" = p."warehouseId" AND w."shopId" = p."shopId"
      LEFT JOIN "InventoryItem" item ON item."id" = p."inventoryItemId" AND item."shopId" = p."shopId"
      WHERE p."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
      ORDER BY p."serviceOrderId", p."sortOrder", p."createdAt"
    `,
    prisma.$queryRaw<VehicleHistoryInspection[]>`
      SELECT si."id", si."serviceOrderId", si."inspectionType", si."status", si."summary", inspector."name" AS "inspectorName", si."inspectedAt", si."createdAt"
      FROM "ServiceInspection" si
      JOIN "ServiceOrder" so ON so."id" = si."serviceOrderId" AND so."shopId" = si."shopId"
      LEFT JOIN "User" inspector ON inspector."id" = si."inspectorUserId"
      WHERE si."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
      ORDER BY si."serviceOrderId", COALESCE(si."inspectedAt", si."createdAt") DESC
    `,
    prisma.$queryRaw<VehicleHistoryQuotation[]>`
      SELECT q."id", q."serviceOrderId", q."quoteNumber", q."revision", q."status",
             q."subtotal"::double precision AS "subtotal", q."discountTotal"::double precision AS "discountTotal",
             q."taxTotal"::double precision AS "taxTotal", q."total"::double precision AS "total",
             q."validUntil", q."notes", q."sentAt", q."createdAt"
      FROM "Quotation" q JOIN "ServiceOrder" so ON so."id" = q."serviceOrderId" AND so."shopId" = q."shopId"
      WHERE q."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
      ORDER BY q."serviceOrderId", q."revision" DESC, q."createdAt" DESC
    `,
    prisma.$queryRaw<VehicleHistoryApproval[]>`
      SELECT ca."id", ca."serviceOrderId", ca."quotationId", ca."decision", ca."channel", ca."customerNameSnapshot", ca."note", ca."decidedAt", recorder."name" AS "recordedByName"
      FROM "CustomerApproval" ca
      JOIN "ServiceOrder" so ON so."id" = ca."serviceOrderId" AND so."shopId" = ca."shopId"
      LEFT JOIN "User" recorder ON recorder."id" = ca."recordedByUserId"
      WHERE ca."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
      ORDER BY ca."serviceOrderId", ca."decidedAt" DESC
    `,
    prisma.$queryRaw<VehicleHistoryPayment[]>`
      SELECT p."id", inv."serviceOrderId", p."invoiceId", p."amount"::double precision AS "amount", p."method"::text AS "method",
             p."sourceName", p."reference", p."note", p."paidAt"
      FROM "Payment" p
      JOIN "Invoice" inv ON inv."id" = p."invoiceId" AND inv."shopId" = p."shopId"
      JOIN "ServiceOrder" so ON so."id" = inv."serviceOrderId" AND so."shopId" = inv."shopId"
      WHERE p."shopId" = ${shopId}::uuid AND so."vehicleId" = ${vehicleId}::uuid AND so."deletedAt" IS NULL
        AND p."deletedAt" IS NULL AND inv."deletedAt" IS NULL AND inv."status" <> 'VOID'::"InvoiceStatus"
      ORDER BY inv."serviceOrderId", p."paidAt" DESC
    `,
  ]);

  const laborByOrder = groupByOrder(laborLines), partsByOrder = groupByOrder(partLines), inspectionsByOrder = groupByOrder(inspections);
  const quotationsByOrder = groupByOrder(quotations), approvalsByOrder = groupByOrder(approvals), paymentsByOrder = groupByOrder(payments);
  const detailedOrders: VehicleHistoryOrder[] = orders.map((order) => ({ ...order, laborLines: laborByOrder.get(order.id) ?? [], partLines: partsByOrder.get(order.id) ?? [], inspections: inspectionsByOrder.get(order.id) ?? [], quotations: quotationsByOrder.get(order.id) ?? [], approvals: approvalsByOrder.get(order.id) ?? [], payments: paymentsByOrder.get(order.id) ?? [] }));
  const activeLabor = laborLines.filter((line) => line.status !== "CANCELLED");
  const activeParts = partLines.filter((line) => !["CANCELLED", "RETURNED"].includes(line.status));
  const invoiceOrders = detailedOrders.filter((order) => order.invoiceId != null);
  const odometers = detailedOrders.flatMap((order) => [order.odometerAtDelivery, order.odometerAtIntake]).filter((value): value is number => value != null);

  return { metrics: {
    visitCount: detailedOrders.length,
    completedVisitCount: detailedOrders.filter((order) => ["DELIVERED", "CLOSED"].includes(order.status)).length,
    firstServiceAt: detailedOrders.length ? detailedOrders[detailedOrders.length - 1].receivedAt : null,
    lastServiceAt: detailedOrders[0]?.receivedAt ?? null,
    lastRecordedOdometer: odometers.length ? Math.max(...odometers) : null,
    invoicedTotal: invoiceOrders.reduce((sum, order) => sum + Number(order.invoiceTotal ?? 0), 0),
    paidTotal: invoiceOrders.reduce((sum, order) => sum + Number(order.invoiceAmountPaid ?? 0), 0),
    outstandingTotal: invoiceOrders.reduce((sum, order) => sum + Number(order.invoiceBalanceDue ?? 0), 0),
    laborTotal: activeLabor.reduce((sum, line) => sum + Number(line.lineTotal ?? 0), 0),
    partsTotal: activeParts.reduce((sum, line) => sum + Number(line.lineTotal ?? 0), 0),
  }, orders: detailedOrders };
}

export const vehicleHistoryService = { getVehicleLifetimeHistory };
