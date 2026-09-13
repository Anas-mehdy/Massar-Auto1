import { Prisma } from "@prisma/client";
import { localDateString, timeZoneForCountry } from "@/lib/timezone";

/**
 * Serialize financial mutations per shop inside the caller's transaction.
 *
 * DailyCashClose rows do not exist until the first close, so row locks alone
 * cannot protect that first close from a concurrent financial mutation. A
 * transaction-scoped advisory lock gives both paths a stable coordination key
 * even before a DailyCashClose row exists.
 */
export async function lockShopFinancialTx(
  tx: Prisma.TransactionClient,
  shopId: string,
) {
  // Do not return PostgreSQL's `void` advisory-lock result to Prisma; return a
  // normal scalar after executing the side-effect so all drivers can decode it.
  await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::integer AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(hashtextextended(${shopId}::text, 0))
    ) AS financial_lock
  `;
}

/**
 * Check one or more affected financial dates under the same shop-level lock.
 *
 * Historical edits/voids can alter a previously closed day even when the
 * correcting action happens today. Those mutations must therefore validate the
 * original movement date as well as any replacement date.
 */
export async function assertBusinessDatesOpenTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  occurredAts: Array<Date | string>,
) {
  await lockShopFinancialTx(tx, shopId);

  const shop = await tx.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: { countryCode: true },
  });
  if (!shop) throw new Error("المركز غير موجود.");

  const timeZone = timeZoneForCountry(shop.countryCode);
  const businessDates = [...new Set(
    (occurredAts.length ? occurredAts : [new Date()]).map((occurredAt) => localDateString(occurredAt, timeZone)),
  )].sort();

  for (const businessDate of businessDates) {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status"
      FROM "DailyCashClose"
      WHERE "shopId" = ${shopId}::uuid
        AND "businessDate" = ${businessDate}::date
      LIMIT 1
      FOR SHARE
    `;

    if (rows[0]?.status === "CLOSED") {
      throw new Error(
        `يوم ${businessDate} مغلق نقدياً. يجب إعادة فتح اليوم بصلاحية المدير قبل تسجيل أو تعديل حركة مالية.`,
      );
    }
  }

  return businessDates;
}

/**
 * Transaction-scoped business-day lock check for Massar Auto.
 *
 * Use this inside the same transaction that posts a dated financial mutation so
 * a closed cash day cannot be bypassed by a service that does not go through a
 * route-level guard.
 */
export async function assertBusinessDateOpenTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  occurredAt: Date | string = new Date(),
) {
  const [businessDate] = await assertBusinessDatesOpenTx(tx, shopId, [occurredAt]);
  return businessDate;
}

export const businessDateLockService = {
  lockShopFinancialTx,
  assertBusinessDateOpenTx,
  assertBusinessDatesOpenTx,
};
