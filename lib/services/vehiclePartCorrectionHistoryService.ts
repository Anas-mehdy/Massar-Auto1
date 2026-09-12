import { prisma } from "@/lib/prisma";

export type VehicleHistoryPartCorrection = {
  id: string;
  serviceOrderId: string;
  correctionNumber: string;
  partName: string;
  reasonCode: string;
  inventoryDisposition: string;
  quantity: number;
  grossAmountSnapshot: number;
  reason: string;
  notes: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
  warehouseName: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export async function getVehiclePartCorrectionHistory(
  shopId: string,
  vehicleId: string,
): Promise<VehicleHistoryPartCorrection[]> {
  return prisma.$queryRaw<VehicleHistoryPartCorrection[]>`
    SELECT spc."id", spc."serviceOrderId", spc."correctionNumber", spc."partName",
           spc."reasonCode", spc."inventoryDisposition", spc."quantity",
           spc."grossAmountSnapshot"::double precision AS "grossAmountSnapshot",
           spc."reason", spc."notes", spc."creditNoteId", cn."creditNoteNumber",
           w."name" AS "warehouseName", creator."name" AS "createdByName", spc."createdAt"
    FROM "ServicePartCorrection" spc
    JOIN "ServiceOrder" so
      ON so."shopId" = spc."shopId"
     AND so."id" = spc."serviceOrderId"
    LEFT JOIN "InvoiceCreditNote" cn
      ON cn."shopId" = spc."shopId"
     AND cn."id" = spc."creditNoteId"
    LEFT JOIN "Warehouse" w
      ON w."shopId" = spc."shopId"
     AND w."id" = spc."warehouseId"
    LEFT JOIN "User" creator ON creator."id" = spc."createdByUserId"
    WHERE spc."shopId" = ${shopId}::uuid
      AND so."vehicleId" = ${vehicleId}::uuid
      AND so."deletedAt" IS NULL
    ORDER BY spc."serviceOrderId", spc."createdAt" DESC
  `;
}

export const vehiclePartCorrectionHistoryService = {
  getVehiclePartCorrectionHistory,
};
