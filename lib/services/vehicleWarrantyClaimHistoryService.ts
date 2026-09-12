import { prisma } from "@/lib/prisma";

export type VehicleWarrantyClaimHistoryRow = {
  id: string;
  originalServiceOrderId: string;
  followUpServiceOrderId: string | null;
  claimNumber: string;
  claimType: string;
  status: string;
  coverageDecision: string;
  reportedIssue: string;
  assessment: string | null;
  resolution: string | null;
  customerCharge: number;
  warrantyEndsAt: Date | null;
  partName: string | null;
  laborDescription: string | null;
  followUpOrderNumber: string | null;
  createdByName: string | null;
  openedAt: Date;
  decidedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
};

export async function getVehicleWarrantyClaimHistory(
  shopId: string,
  vehicleId: string,
): Promise<VehicleWarrantyClaimHistoryRow[]> {
  return prisma.$queryRaw<VehicleWarrantyClaimHistoryRow[]>`
    SELECT wc."id", wc."originalServiceOrderId", wc."followUpServiceOrderId",
           wc."claimNumber", wc."claimType", wc."status", wc."coverageDecision",
           wc."reportedIssue", wc."assessment", wc."resolution",
           wc."customerCharge"::double precision AS "customerCharge", wc."warrantyEndsAt",
           part."partName", labor."description" AS "laborDescription",
           followup."orderNumber" AS "followUpOrderNumber", creator."name" AS "createdByName",
           wc."openedAt", wc."decidedAt", wc."resolvedAt", wc."closedAt"
    FROM "ServiceWarrantyClaim" wc
    LEFT JOIN "ServicePartLine" part
      ON part."shopId"=wc."shopId" AND part."id"=wc."originalServicePartLineId"
    LEFT JOIN "ServiceLaborLine" labor
      ON labor."shopId"=wc."shopId" AND labor."id"=wc."originalServiceLaborLineId"
    LEFT JOIN "ServiceOrder" followup
      ON followup."shopId"=wc."shopId" AND followup."id"=wc."followUpServiceOrderId"
    LEFT JOIN "User" creator ON creator."id"=wc."createdByUserId"
    WHERE wc."shopId"=${shopId}::uuid
      AND wc."vehicleId"=${vehicleId}::uuid
    ORDER BY wc."originalServiceOrderId", wc."openedAt" DESC, wc."createdAt" DESC
  `;
}

export const vehicleWarrantyClaimHistoryService = { getVehicleWarrantyClaimHistory };
