import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type InventoryDamageReportFilters = {
  start?: Date;
  end?: Date;
  search?: string;
};

export type InventoryDamageReportRow = {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  quantity: number;
  reason: string;
  note: string | null;
  unitCostSnapshot: number;
  totalValue: number;
  createdAt: Date;
  createdByUserId: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  reversedAt: Date | null;
  reversedByUserId: string | null;
  reversedByName: string | null;
  reversedByEmail: string | null;
  reversalMovementId: string | null;
};

type SummaryRow = {
  totalValue: Prisma.Decimal | number | string;
  movementCount: bigint | number;
  damagedUnits: bigint | number;
  itemCount: bigint | number;
};

type DamageRowDb = Omit<InventoryDamageReportRow, "unitCostSnapshot" | "totalValue"> & {
  unitCostSnapshot: Prisma.Decimal | number | string | null;
  totalValue: Prisma.Decimal | number | string;
};

function normalizeFilters(filters: InventoryDamageReportFilters = {}) {
  const search = filters.search?.trim() || null;

  return {
    start: filters.start ?? null,
    end: filters.end ?? null,
    searchPattern: search ? `%${search}%` : null,
  };
}

async function queryInventoryDamageSummary(shopId: string, filters: InventoryDamageReportFilters = {}) {
  const { start, end, searchPattern } = normalizeFilters(filters);

  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT
      COALESCE(SUM(d."quantity" * COALESCE(d."unitCostSnapshot", 0)), 0) AS "totalValue",
      COUNT(*) AS "movementCount",
      COALESCE(SUM(d."quantity"), 0) AS "damagedUnits",
      COUNT(DISTINCT d."inventoryItemId") AS "itemCount"
    FROM "InventoryDamage" d
    INNER JOIN "InventoryItem" i ON i."id" = d."inventoryItemId"
    LEFT JOIN "User" u ON u."id" = d."createdByUserId"
    LEFT JOIN "User" ru ON ru."id" = d."reversedByUserId"
    WHERE d."shopId" = ${shopId}::uuid
      AND d."reversedAt" IS NULL
      AND (${start}::timestamptz IS NULL OR d."createdAt" >= ${start})
      AND (${end}::timestamptz IS NULL OR d."createdAt" < ${end})
      AND (
        ${searchPattern}::text IS NULL
        OR i."name" ILIKE ${searchPattern}
        OR COALESCE(i."sku", '') ILIKE ${searchPattern}
        OR COALESCE(i."barcode", '') ILIKE ${searchPattern}
        OR d."reason" ILIKE ${searchPattern}
        OR COALESCE(d."note", '') ILIKE ${searchPattern}
        OR COALESCE(u."name", '') ILIKE ${searchPattern}
        OR COALESCE(u."email", '') ILIKE ${searchPattern}
        OR COALESCE(ru."name", '') ILIKE ${searchPattern}
        OR COALESCE(ru."email", '') ILIKE ${searchPattern}
      )
  `;

  return {
    totalValue: Number(rows[0]?.totalValue ?? 0),
    movementCount: Number(rows[0]?.movementCount ?? 0),
    damagedUnits: Number(rows[0]?.damagedUnits ?? 0),
    itemCount: Number(rows[0]?.itemCount ?? 0),
  };
}

export async function getInventoryDamageReportSummary(shopId: string, start: Date, end: Date) {
  try {
    return await queryInventoryDamageSummary(shopId, { start, end });
  } catch {
    return { totalValue: 0, movementCount: 0, damagedUnits: 0, itemCount: 0 };
  }
}

export async function getInventoryDamageReport(
  shopId: string,
  filters: InventoryDamageReportFilters = {},
) {
  const { start, end, searchPattern } = normalizeFilters(filters);

  const [summary, rows] = await Promise.all([
    queryInventoryDamageSummary(shopId, filters),
    prisma.$queryRaw<DamageRowDb[]>`
      SELECT
        d."id",
        d."inventoryItemId",
        i."name" AS "itemName",
        i."sku",
        i."barcode",
        i."category",
        d."quantity",
        d."reason",
        d."note",
        d."unitCostSnapshot",
        (d."quantity" * COALESCE(d."unitCostSnapshot", 0)) AS "totalValue",
        d."createdAt",
        d."createdByUserId",
        u."name" AS "createdByName",
        u."email" AS "createdByEmail",
        d."reversedAt",
        d."reversedByUserId",
        ru."name" AS "reversedByName",
        ru."email" AS "reversedByEmail",
        d."reversalMovementId"
      FROM "InventoryDamage" d
      INNER JOIN "InventoryItem" i ON i."id" = d."inventoryItemId"
      LEFT JOIN "User" u ON u."id" = d."createdByUserId"
      LEFT JOIN "User" ru ON ru."id" = d."reversedByUserId"
      WHERE d."shopId" = ${shopId}::uuid
        AND (${start}::timestamptz IS NULL OR d."createdAt" >= ${start})
        AND (${end}::timestamptz IS NULL OR d."createdAt" < ${end})
        AND (
          ${searchPattern}::text IS NULL
          OR i."name" ILIKE ${searchPattern}
          OR COALESCE(i."sku", '') ILIKE ${searchPattern}
          OR COALESCE(i."barcode", '') ILIKE ${searchPattern}
          OR d."reason" ILIKE ${searchPattern}
          OR COALESCE(d."note", '') ILIKE ${searchPattern}
          OR COALESCE(u."name", '') ILIKE ${searchPattern}
          OR COALESCE(u."email", '') ILIKE ${searchPattern}
          OR COALESCE(ru."name", '') ILIKE ${searchPattern}
          OR COALESCE(ru."email", '') ILIKE ${searchPattern}
        )
      ORDER BY d."createdAt" DESC, d."id" DESC
    `,
  ]);

  return {
    summary,
    rows: rows.map((row) => ({
      ...row,
      unitCostSnapshot: Number(row.unitCostSnapshot ?? 0),
      totalValue: Number(row.totalValue ?? 0),
    })),
  };
}
