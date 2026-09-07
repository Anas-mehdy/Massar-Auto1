import {
  CompatibilityCandidateStatus,
  CompatibilityImportStatus,
  InventoryMovementType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inventoryCategoryService } from "./inventoryCategoryService";

export type InventoryItemFilters = {
  search?: string;
  lowStockOnly?: boolean;
  categoryId?: string;
  uncategorizedOnly?: boolean;
};

export type CreateInventoryItemInput = {
  name: string;
  categoryId?: string;
  newCategoryName?: string;
  sku?: string;
  description?: string;
  unitCost?: string;
  unitPrice: string;
  quantity?: string;
  reorderLevel?: string;
  compatibilityGroupIds?: string[];
};

export type UpdateInventoryItemDetailsInput = {
  name: string;
  categoryId?: string;
  newCategoryName?: string;
  sku?: string;
  description?: string;
  unitCost?: string;
  unitPrice: string;
  reorderLevel?: string;
  compatibilityGroupIds?: string[];
};

export type AddStockInput = {
  quantity: string;
  supplierId?: string | null;
  note?: string;
};

export type AdjustStockInput = {
  newQuantity: string;
  note?: string;
};

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decimalOrZero(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return new Prisma.Decimal(0);
  return new Prisma.Decimal(trimmed.replace(",", "."));
}

function decimalOrNull(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return new Prisma.Decimal(trimmed.replace(",", "."));
}

function integerOrZero(value?: string) {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listInventoryItems(
  shopId: string,
  filters: InventoryItemFilters = {},
) {
  const search = filters.search?.trim();
  const scopedIds = await inventoryCategoryService.listInventoryItemIdsForCategory(
    shopId,
    filters.categoryId,
    filters.uncategorizedOnly,
  );

  const items = await prisma.inventoryItem.findMany({
    where: {
      shopId,
      deletedAt: null,
      ...(scopedIds ? { id: { in: scopedIds } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { compatibilityGroupLinks: true } },
    },
    take: 100,
  });

  return filters.lowStockOnly
    ? items.filter((item) => item.quantity <= item.reorderLevel)
    : items;
}

export async function getInventoryItemById(
  shopId: string,
  inventoryItemId: string,
) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, shopId, deletedAt: null },
    include: {
      compatibilityGroupLinks: {
        include: {
          candidateGroup: {
            include: {
              batch: { select: { categoryName: true } },
              members: {
                orderBy: { position: "asc" },
                select: { id: true, rawModelName: true },
              },
            },
          },
        },
      },
    },
  });

  if (!item) return null;
  const categoryLink = await prisma.$queryRaw<Array<{ categoryId: string | null }>>`
    SELECT "categoryId"
    FROM "InventoryItem"
    WHERE "id" = ${inventoryItemId}::uuid
      AND "shopId" = ${shopId}::uuid
    LIMIT 1
  `;

  return { ...item, categoryId: categoryLink[0]?.categoryId ?? null };
}

function uniqueGroupIds(ids?: string[]) {
  return [...new Set((ids || []).filter(Boolean))];
}

async function validateCompatibilityGroups(
  tx: Prisma.TransactionClient,
  ids?: string[],
) {
  const groupIds = uniqueGroupIds(ids);
  if (groupIds.length === 0) return groupIds;

  const validGroups = await tx.compatibilityCandidateGroup.count({
    where: {
      id: { in: groupIds },
      status: {
        in: [
          CompatibilityCandidateStatus.READY_FOR_CORROBORATION,
          CompatibilityCandidateStatus.APPROVED,
        ],
      },
      batch: {
        status: {
          in: [CompatibilityImportStatus.READY_FOR_REVIEW, CompatibilityImportStatus.IMPORTED],
        },
      },
    },
  });

  if (validGroups !== groupIds.length) {
    throw new Error("مجموعة التوافق المحددة غير متاحة أو لم تعد صالحة.");
  }

  return groupIds;
}

export async function getInventoryMovements(shopId: string, inventoryItemId: string) {
  const movements = await prisma.inventoryMovement.findMany({
    where: { shopId, inventoryItemId, deletedAt: null },
    include: {
      repairOrder: { select: { id: true, ticketNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  if (movements.length === 0) return [];

  const supplierLinks = await prisma.$queryRaw<
    Array<{ movementId: string; supplierId: string | null; supplierName: string | null }>
  >`
    SELECT
      m."id" AS "movementId",
      m."supplierId" AS "supplierId",
      s."name" AS "supplierName"
    FROM "InventoryMovement" m
    LEFT JOIN "Supplier" s
      ON s."id" = m."supplierId"
      AND s."shopId" = ${shopId}::uuid
      AND s."deletedAt" IS NULL
    WHERE m."shopId" = ${shopId}::uuid
      AND m."inventoryItemId" = ${inventoryItemId}::uuid
      AND m."id" IN (${Prisma.join(movements.map((movement) => Prisma.sql`${movement.id}::uuid`))})
  `;

  const supplierByMovement = new Map(
    supplierLinks.map((row) => [
      row.movementId,
      row.supplierId && row.supplierName
        ? { id: row.supplierId, name: row.supplierName }
        : null,
    ]),
  );

  return movements.map((movement) => ({
    ...movement,
    supplier: supplierByMovement.get(movement.id) ?? null,
  }));
}

export async function createInventoryItem(
  shopId: string,
  createdByUserId: string | null,
  input: CreateInventoryItemInput,
) {
  const initialQuantity = integerOrZero(input.quantity);
  const category = await inventoryCategoryService.resolveInventoryCategory(shopId, input);

  return prisma.$transaction(async (tx) => {
    const compatibilityGroupIds = await validateCompatibilityGroups(tx, input.compatibilityGroupIds);
    const item = await tx.inventoryItem.create({
      data: {
        shopId,
        name: input.name.trim(),
        category: category?.name ?? null,
        sku: emptyToNull(input.sku),
        description: emptyToNull(input.description),
        unitCost: decimalOrNull(input.unitCost),
        unitPrice: decimalOrZero(input.unitPrice),
        quantity: initialQuantity,
        reorderLevel: integerOrZero(input.reorderLevel),
      },
    });

    if (category) {
      await tx.$executeRaw`
        UPDATE "InventoryItem"
        SET "categoryId" = ${category.id}::uuid
        WHERE "id" = ${item.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }

    if (compatibilityGroupIds.length > 0) {
      await tx.inventoryCompatibilityGroup.createMany({
        data: compatibilityGroupIds.map((candidateGroupId) => ({ inventoryItemId: item.id, candidateGroupId })),
      });
    }

    if (initialQuantity > 0) {
      await tx.inventoryMovement.create({
        data: {
          shopId,
          inventoryItemId: item.id,
          createdByUserId,
          type: InventoryMovementType.STOCK_IN,
          quantityChange: initialQuantity,
          quantityAfter: initialQuantity,
          unitCostSnapshot: item.unitCost,
          note: "رصيد افتتاحي",
        },
      });
    }

    return item;
  });
}

export async function updateInventoryItemDetails(
  shopId: string,
  inventoryItemId: string,
  input: UpdateInventoryItemDetailsInput,
) {
  const existing = await getInventoryItemById(shopId, inventoryItemId);
  if (!existing) throw new Error("قطعة المخزون غير موجودة.");
  const category = await inventoryCategoryService.resolveInventoryCategory(shopId, input);

  return prisma.$transaction(async (tx) => {
    const compatibilityGroupIds = await validateCompatibilityGroups(tx, input.compatibilityGroupIds);
    const item = await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: {
        name: input.name.trim(),
        category: category?.name ?? null,
        sku: emptyToNull(input.sku),
        description: emptyToNull(input.description),
        unitCost: decimalOrNull(input.unitCost),
        unitPrice: decimalOrZero(input.unitPrice),
        // Reaching this explicit item-edit flow means the user intentionally set the
        // selling price; zero is therefore a valid deliberate price, not "unset".
        salePriceConfigured: true,
        reorderLevel: integerOrZero(input.reorderLevel),
        version: { increment: 1 },
      },
    });

    await tx.$executeRaw`
      UPDATE "InventoryItem"
      SET "categoryId" = ${category?.id ?? null}::uuid
      WHERE "id" = ${inventoryItemId}::uuid AND "shopId" = ${shopId}::uuid
    `;

    await tx.inventoryCompatibilityGroup.deleteMany({ where: { inventoryItemId } });
    if (compatibilityGroupIds.length > 0) {
      await tx.inventoryCompatibilityGroup.createMany({
        data: compatibilityGroupIds.map((candidateGroupId) => ({ inventoryItemId, candidateGroupId })),
      });
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { compatibilityReviewNeeded: false },
      });
    }

    return item;
  });
}

export async function addStock(
  shopId: string,
  inventoryItemId: string,
  createdByUserId: string | null,
  input: AddStockInput,
) {
  const quantityToAdd = integerOrZero(input.quantity);
  if (quantityToAdd <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر.");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCost: Prisma.Decimal | null }>>`
      SELECT "id","quantity","unitCost" FROM "InventoryItem"
      WHERE "id"=${inventoryItemId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const item=rows[0];
    if(!item) throw new Error("قطعة المخزون غير موجودة.");
    if(item.quantity<0) throw new Error("لا يمكن الإضافة فوق مخزون سالب. صحح الرصيد أولاً.");
    // This legacy quick-add flow carries no purchase cost. Preserve the current
    // average as-is (including NULL) rather than inventing a zero cost.

    const supplierId=emptyToNull(input.supplierId);
    if(supplierId){
      const supplier=await tx.supplier.findFirst({where:{id:supplierId,shopId,deletedAt:null},select:{id:true}});
      if(!supplier) throw new Error("المورد المحدد غير موجود أو لا ينتمي إلى هذا المتجر.");
    }
    const updatedItem=await tx.inventoryItem.update({where:{id:inventoryItemId},data:{quantity:{increment:quantityToAdd},version:{increment:1}}});
    const movement=await tx.inventoryMovement.create({data:{shopId,inventoryItemId,createdByUserId,type:InventoryMovementType.STOCK_IN,quantityChange:quantityToAdd,quantityAfter:updatedItem.quantity,unitCostSnapshot:item.unitCost,note:emptyToNull(input.note)},select:{id:true}});
    if(supplierId) await tx.$executeRaw`UPDATE "InventoryMovement" SET "supplierId"=${supplierId}::uuid WHERE "id"=${movement.id}::uuid AND "shopId"=${shopId}::uuid`;
    return updatedItem;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function adjustStock(
  shopId: string,
  inventoryItemId: string,
  createdByUserId: string | null,
  input: AdjustStockInput,
) {
  const newQuantity = integerOrZero(input.newQuantity);
  if(newQuantity<0) throw new Error("المخزون السالب غير مسموح.");
  return prisma.$transaction(async(tx)=>{
    const rows=await tx.$queryRaw<Array<{id:string;quantity:number;unitCost:Prisma.Decimal|null}>>`
      SELECT "id","quantity","unitCost" FROM "InventoryItem" WHERE "id"=${inventoryItemId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const item=rows[0];
    if(!item) throw new Error("قطعة المخزون غير موجودة.");
    if(item.quantity<0) throw new Error("الرصيد الحالي سالب. صححه بمسار مخصص قبل أي حركة أخرى.");
    const quantityChange=newQuantity-item.quantity;
    if(quantityChange===0) return tx.inventoryItem.findUniqueOrThrow({where:{id:inventoryItemId}});
    const updatedItem=await tx.inventoryItem.update({where:{id:inventoryItemId},data:{quantity:newQuantity,version:{increment:1}}});
    await tx.inventoryMovement.create({data:{shopId,inventoryItemId,createdByUserId,type:InventoryMovementType.ADJUSTMENT,quantityChange,quantityAfter:newQuantity,unitCostSnapshot:item.unitCost,note:emptyToNull(input.note)}});
    // Quantity-only adjustments are valued at the current average, so average cost
    // remains unchanged for both increases and decreases.
    return updatedItem;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function softDeleteInventoryItem(shopId: string, inventoryItemId: string) {
  const result = await prisma.inventoryItem.updateMany({
    where: { id: inventoryItemId, shopId, deletedAt: null },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });
  if (result.count === 0) throw new Error("قطعة المخزون غير موجودة أو محذوفة مسبقاً.");
}

export const inventoryService = {
  listInventoryItems,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItemDetails,
  addStock,
  adjustStock,
  softDeleteInventoryItem,
  getInventoryMovements,
};
