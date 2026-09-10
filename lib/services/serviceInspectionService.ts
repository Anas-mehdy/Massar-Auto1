import { prisma } from "@/lib/prisma";

export type ServiceInspectionItemRow = {
  id: string;
  component: string;
  result: "OK" | "WARNING" | "FAIL" | "NOT_CHECKED";
  notes: string | null;
  recommendedAction: string | null;
  estimatedCost: string | number | null;
  sortOrder: number;
};

export type ServiceInspectionRow = {
  id: string;
  inspectionType: "INITIAL" | "FINAL" | "OTHER";
  status: string;
  summary: string | null;
  inspectorUserId: string | null;
  inspectorName: string | null;
  inspectedAt: Date | null;
  createdAt: Date;
  items: ServiceInspectionItemRow[];
};

export async function listServiceInspections(shopId: string, serviceOrderId: string): Promise<ServiceInspectionRow[]> {
  const inspections = await prisma.$queryRaw<Array<Omit<ServiceInspectionRow, "items">>>`
    SELECT
      si."id",
      si."inspectionType",
      si."status",
      si."summary",
      si."inspectorUserId",
      u."name" AS "inspectorName",
      si."inspectedAt",
      si."createdAt"
    FROM "ServiceInspection" si
    LEFT JOIN "User" u ON u."id" = si."inspectorUserId" AND u."shopId" = si."shopId"
    WHERE si."shopId" = ${shopId}::uuid
      AND si."serviceOrderId" = ${serviceOrderId}::uuid
    ORDER BY COALESCE(si."inspectedAt", si."createdAt") DESC, si."createdAt" DESC
  `;

  if (!inspections.length) return [];

  const items = await prisma.$queryRaw<Array<ServiceInspectionItemRow & { inspectionId: string }>>`
    SELECT
      sii."id",
      sii."inspectionId",
      sii."component",
      sii."result",
      sii."notes",
      sii."recommendedAction",
      sii."estimatedCost",
      sii."sortOrder"
    FROM "ServiceInspectionItem" sii
    JOIN "ServiceInspection" si ON si."id" = sii."inspectionId" AND si."shopId" = sii."shopId"
    WHERE sii."shopId" = ${shopId}::uuid
      AND si."serviceOrderId" = ${serviceOrderId}::uuid
    ORDER BY sii."inspectionId", sii."sortOrder", sii."createdAt"
  `;

  const itemsByInspection = new Map<string, ServiceInspectionItemRow[]>();
  for (const item of items) {
    const list = itemsByInspection.get(item.inspectionId) ?? [];
    const { inspectionId: _inspectionId, ...cleanItem } = item;
    list.push(cleanItem);
    itemsByInspection.set(item.inspectionId, list);
  }

  return inspections.map((inspection) => ({
    ...inspection,
    items: itemsByInspection.get(inspection.id) ?? [],
  }));
}

export const serviceInspectionService = {
  listServiceInspections,
};
