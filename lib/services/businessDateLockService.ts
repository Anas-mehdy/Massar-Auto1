import { Prisma } from "@prisma/client";
import { localDateString, timeZoneForCountry } from "@/lib/timezone";

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
  const shop = await tx.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: { countryCode: true },
  });
  if (!shop) throw new Error("المركز غير موجود.");

  const timeZone = timeZoneForCountry(shop.countryCode);
  const businessDate = localDateString(occurredAt, timeZone);
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

  return businessDate;
}

export const businessDateLockService = { assertBusinessDateOpenTx };
