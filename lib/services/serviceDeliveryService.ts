import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ServiceDeliveryContext = {
  id: string;
  status: string;
  vehicleId: string;
  orderNumber: string;
  odometerAtIntake: number | null;
  odometerAtDelivery: number | null;
  deliveryNotes: string | null;
  resolutionNotes: string | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  deliveredByUserId: string | null;
  closedByUserId: string | null;
  deliveredByName: string | null;
  closedByName: string | null;
  currentOdometer: number | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceTotal: number | null;
  invoiceBalanceDue: number | null;
};

type DeliveryInput = {
  odometerAtDelivery?: number | null;
  deliveryNotes?: string | null;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateOdometer(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error("قراءة عداد التسليم غير صالحة.");
  return value;
}

export async function getServiceDeliveryContext(
  shopId: string,
  serviceOrderId: string,
): Promise<ServiceDeliveryContext | null> {
  const rows = await prisma.$queryRaw<ServiceDeliveryContext[]>`
    SELECT
      so."id", so."status", so."vehicleId", so."orderNumber",
      so."odometerAtIntake", so."odometerAtDelivery", so."deliveryNotes", so."resolutionNotes",
      so."deliveredAt", so."closedAt", so."deliveredByUserId", so."closedByUserId",
      delivered_by."name" AS "deliveredByName",
      closed_by."name" AS "closedByName",
      v."currentOdometer",
      inv."id" AS "invoiceId",
      inv."invoiceNumber",
      inv."status"::text AS "invoiceStatus",
      inv."total"::double precision AS "invoiceTotal",
      inv."balanceDue"::double precision AS "invoiceBalanceDue"
    FROM "ServiceOrder" so
    JOIN "Vehicle" v
      ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    LEFT JOIN "User" delivered_by ON delivered_by."id" = so."deliveredByUserId"
    LEFT JOIN "User" closed_by ON closed_by."id" = so."closedByUserId"
    LEFT JOIN LATERAL (
      SELECT i."id", i."invoiceNumber", i."status", i."total", i."balanceDue"
      FROM "Invoice" i
      WHERE i."shopId" = so."shopId"
        AND i."serviceOrderId" = so."id"
        AND i."deletedAt" IS NULL
        AND i."status" <> 'VOID'::"InvoiceStatus"
      ORDER BY i."issuedAt" DESC
      LIMIT 1
    ) inv ON true
    WHERE so."id" = ${serviceOrderId}::uuid
      AND so."shopId" = ${shopId}::uuid
      AND so."deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function assertNoOpenWorkTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  serviceOrderId: string,
) {
  const [reservedParts, unfinishedParts, unfinishedLabor] = await Promise.all([
    tx.$queryRaw<Array<{ partName: string }>>`
      SELECT "partName"
      FROM "ServicePartLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" = 'RESERVED'
      ORDER BY "sortOrder", "createdAt"
      LIMIT 5
    `,
    tx.$queryRaw<Array<{ partName: string; status: string }>>`
      SELECT "partName", "status"
      FROM "ServicePartLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" NOT IN ('USED', 'RETURNED', 'CANCELLED')
      ORDER BY "sortOrder", "createdAt"
      LIMIT 5
    `,
    tx.$queryRaw<Array<{ description: string; status: string }>>`
      SELECT "description", "status"
      FROM "ServiceLaborLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" NOT IN ('DONE', 'CANCELLED')
      ORDER BY "sortOrder", "createdAt"
      LIMIT 5
    `,
  ]);

  if (reservedParts.length) {
    throw new Error(`لا يمكن تسليم المركبة وهناك قطع ما زالت محجوزة: ${reservedParts.map((row) => row.partName).join("، ")}.`);
  }
  if (unfinishedParts.length) {
    throw new Error(`لا يمكن إكمال التسليم قبل حسم حالة قطع الغيار: ${unfinishedParts.map((row) => `${row.partName} (${row.status})`).join("، ")}.`);
  }
  if (unfinishedLabor.length) {
    throw new Error(`لا يمكن إكمال التسليم قبل إنهاء أعمال الصيانة: ${unfinishedLabor.map((row) => `${row.description} (${row.status})`).join("، ")}.`);
  }
}

async function getActiveInvoiceTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  serviceOrderId: string,
) {
  const rows = await tx.$queryRaw<Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    total: number;
    effectiveTotal: number;
    balanceDue: number;
  }>>`
    SELECT i."id", i."invoiceNumber", i."status"::text AS "status",
           i."total"::double precision AS "total",
           GREATEST(
             i."total" - COALESCE((
               SELECT SUM(cn."amount")
               FROM "InvoiceCreditNote" cn
               WHERE cn."shopId" = i."shopId" AND cn."invoiceId" = i."id"
             ), 0),
             0
           )::double precision AS "effectiveTotal",
           i."balanceDue"::double precision AS "balanceDue"
    FROM "Invoice" i
    WHERE i."shopId" = ${shopId}::uuid
      AND i."serviceOrderId" = ${serviceOrderId}::uuid
      AND i."deletedAt" IS NULL
      AND i."status" <> 'VOID'::"InvoiceStatus"
    ORDER BY i."issuedAt" DESC
    LIMIT 1
    FOR SHARE
  `;
  return rows[0] ?? null;
}

export async function deliverServiceOrder(
  shopId: string,
  serviceOrderId: string,
  deliveredByUserId: string,
  input: DeliveryInput = {},
) {
  const odometerAtDelivery = validateOdometer(input.odometerAtDelivery);
  const deliveryNotes = cleanText(input.deliveryNotes);

  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      vehicleId: string;
      orderNumber: string;
      odometerAtIntake: number | null;
      currentOdometer: number | null;
    }>>`
      SELECT so."id", so."status", so."vehicleId", so."orderNumber", so."odometerAtIntake", v."currentOdometer"
      FROM "ServiceOrder" so
      JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
      WHERE so."id" = ${serviceOrderId}::uuid
        AND so."shopId" = ${shopId}::uuid
        AND so."deletedAt" IS NULL
      FOR UPDATE OF so, v
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (order.status !== "READY_FOR_DELIVERY") {
      throw new Error("يمكن تسليم المركبة فقط عندما تكون حالة أمر الصيانة «جاهزة للتسليم».");
    }

    if (odometerAtDelivery != null) {
      const minimumOdometer = Math.max(order.odometerAtIntake ?? 0, order.currentOdometer ?? 0);
      if (odometerAtDelivery < minimumOdometer) {
        throw new Error(`عداد التسليم لا يمكن أن يكون أقل من آخر قراءة مسجلة (${minimumOdometer} كم).`);
      }
    }

    const invoice = await getActiveInvoiceTx(tx, shopId, serviceOrderId);
    if (!invoice) {
      throw new Error("لا يمكن تسليم المركبة قبل إصدار فاتورة الصيانة. يمكن أن تبقى الفاتورة غير مدفوعة أو جزئية وتُسجل الذمة على العميل.");
    }

    await assertNoOpenWorkTx(tx, shopId, serviceOrderId);

    const updated = await tx.$queryRaw<Array<{ id: string; deliveredAt: Date }>>`
      UPDATE "ServiceOrder"
      SET "status" = 'DELIVERED',
          "odometerAtDelivery" = ${odometerAtDelivery},
          "deliveryNotes" = ${deliveryNotes},
          "deliveredByUserId" = ${deliveredByUserId}::uuid,
          "deliveredAt" = now(),
          "finalTotal" = ${invoice.effectiveTotal},
          "updatedByUserId" = ${deliveredByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      RETURNING "id", "deliveredAt"
    `;

    if (odometerAtDelivery != null && (order.currentOdometer == null || odometerAtDelivery > order.currentOdometer)) {
      await tx.$executeRaw`
        UPDATE "Vehicle"
        SET "currentOdometer" = ${odometerAtDelivery},
            "updatedAt" = now(),
            "version" = "version" + 1
        WHERE "id" = ${order.vehicleId}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }

    const historyNote = [
      `تسليم المركبة — فاتورة ${invoice.invoiceNumber}`,
      invoice.balanceDue > 0 ? `متبقي على الذمة ${invoice.balanceDue}` : "الفاتورة مسددة بالكامل",
      odometerAtDelivery != null ? `عداد التسليم ${odometerAtDelivery} كم` : null,
      deliveryNotes,
    ].filter(Boolean).join(" • ");

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" (
        "shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId"
      ) VALUES (
        ${shopId}::uuid, ${serviceOrderId}::uuid, 'READY_FOR_DELIVERY', 'DELIVERED', ${historyNote}, ${deliveredByUserId}::uuid
      )
    `;

    return {
      ...updated[0],
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      balanceDue: invoice.balanceDue,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function closeServiceOrder(
  shopId: string,
  serviceOrderId: string,
  closedByUserId: string,
  resolutionNotes?: string | null,
) {
  const finalNotes = cleanText(resolutionNotes);

  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      deliveredAt: Date | null;
      deliveredByUserId: string | null;
    }>>`
      SELECT "id", "status", "deliveredAt", "deliveredByUserId"
      FROM "ServiceOrder"
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (order.status !== "DELIVERED") {
      throw new Error("يمكن إغلاق أمر الصيانة بعد تسجيل تسليم المركبة فقط.");
    }
    if (!order.deliveredAt || !order.deliveredByUserId) {
      throw new Error("بيانات تسليم المركبة غير مكتملة؛ لا يمكن إغلاق الأمر قبل تصحيح سجل التسليم.");
    }

    const invoice = await getActiveInvoiceTx(tx, shopId, serviceOrderId);
    if (!invoice) {
      throw new Error("فاتورة الصيانة المرتبطة بالأمر غير موجودة أو ملغاة. أصدر فاتورة فعالة قبل الإغلاق.");
    }

    await assertNoOpenWorkTx(tx, shopId, serviceOrderId);

    const updated = await tx.$queryRaw<Array<{ id: string; closedAt: Date }>>`
      UPDATE "ServiceOrder"
      SET "status" = 'CLOSED',
          "closedAt" = now(),
          "closedByUserId" = ${closedByUserId}::uuid,
          "resolutionNotes" = COALESCE(${finalNotes}, "resolutionNotes"),
          "finalTotal" = ${invoice.effectiveTotal},
          "updatedByUserId" = ${closedByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      RETURNING "id", "closedAt"
    `;

    const historyNote = [
      `إغلاق أمر الصيانة — فاتورة ${invoice.invoiceNumber}`,
      invoice.balanceDue > 0 ? `المتبقي على الذمة ${invoice.balanceDue}` : "الفاتورة مسددة بالكامل",
      finalNotes,
    ].filter(Boolean).join(" • ");

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" (
        "shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId"
      ) VALUES (
        ${shopId}::uuid, ${serviceOrderId}::uuid, 'DELIVERED', 'CLOSED', ${historyNote}, ${closedByUserId}::uuid
      )
    `;

    return {
      ...updated[0],
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      balanceDue: invoice.balanceDue,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const serviceDeliveryService = {
  getServiceDeliveryContext,
  deliverServiceOrder,
  closeServiceOrder,
};
