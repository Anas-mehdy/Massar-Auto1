import { prisma } from "@/lib/prisma";

export type DailyCashCloseEventRow = {
  id: string;
  dailyCashCloseId: string;
  action: "CLOSED" | "REOPENED" | "RECLOSED";
  version: number;
  reason: string | null;
  snapshot: unknown;
  performedByUserId: string | null;
  performedByName: string | null;
  createdAt: Date;
};

export async function listCloseEvents(shopId: string, dailyCashCloseId: string): Promise<DailyCashCloseEventRow[]> {
  return prisma.$queryRaw<DailyCashCloseEventRow[]>`
    SELECT e."id", e."dailyCashCloseId", e."action", e."version", e."reason", e."snapshot",
           e."performedByUserId", u."name" AS "performedByName", e."createdAt"
    FROM "DailyCashCloseEvent" e
    LEFT JOIN "User" u ON u."id" = e."performedByUserId"
    WHERE e."shopId" = ${shopId}::uuid AND e."dailyCashCloseId" = ${dailyCashCloseId}::uuid
    ORDER BY e."createdAt" DESC
  `;
}

export const dailyCashCloseQueryService = { listCloseEvents };
