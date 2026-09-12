import { prisma } from "@/lib/prisma";

export type WarrantyFollowUpLink = {
  claimId: string;
  claimNumber: string;
  claimType: string;
  claimStatus: string;
  coverageDecision: string;
  customerCharge: string;
  originalServiceOrderId: string;
  originalOrderNumber: string;
};

export async function getWarrantyFollowUpLink(
  shopId: string,
  serviceOrderId: string,
): Promise<WarrantyFollowUpLink | null> {
  const rows = await prisma.$queryRaw<WarrantyFollowUpLink[]>`
    SELECT wc."id" AS "claimId", wc."claimNumber", wc."claimType",
           wc."status" AS "claimStatus", wc."coverageDecision", wc."customerCharge"::text AS "customerCharge",
           wc."originalServiceOrderId", original."orderNumber" AS "originalOrderNumber"
    FROM "ServiceWarrantyClaim" wc
    JOIN "ServiceOrder" original
      ON original."shopId"=wc."shopId" AND original."id"=wc."originalServiceOrderId"
    WHERE wc."shopId"=${shopId}::uuid
      AND wc."followUpServiceOrderId"=${serviceOrderId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const serviceWarrantyLinkService = { getWarrantyFollowUpLink };
