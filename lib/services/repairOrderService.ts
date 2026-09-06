import { InvoiceStatus, MembershipRole, MembershipStatus, Prisma, RepairStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const repairOrderInclude = {
  customer: true,
  supplier: true,
  items: {
    where: {
      deletedAt: null,
    },
    include: {
      inventoryItem: true,
      supplier: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
  statusHistory: {
    orderBy: {
      createdAt: "asc",
    },
  },
  assignmentHistory: {
    orderBy: {
      createdAt: "desc",
    },
  },
  inventoryMovements: {
    where: {
      deletedAt: null,
    },
    include: {
      inventoryItem: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  },
  invoices: {
    where: {
      deletedAt: null,
      status: {
        not: InvoiceStatus.VOID,
      },
    },
    orderBy: {
      issuedAt: "desc",
    },
  },
} satisfies Prisma.RepairOrderInclude;

export type RepairOrderListFilters = {
  status?: RepairStatus | "ALL";
  search?: string;
  assignment?: "ALL" | "MINE" | "UNASSIGNED";
  currentUserId?: string;
};

export type RepairOrderItemInput = {
  id?: string;
  inventoryItemId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  partName: string;
  quantity: number;
  unitCost?: string | number | null;
  unitPrice?: string | number | null;
  notes?: string | null;
};

export type CreateRepairOrderInput = {
  customerName: string;
  customerPhone: string;
  customerNotes?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceSerial?: string;
  reportedIssue: string;
  estimatedTotal?: string;
  dueAt?: string;
  notes?: string;
  assignedToUserId?: string;
  // Legacy single part fields for backward compatibility
  supplierId?: string;
  supplierName?: string;
  partName?: string;
  partCost?: string;
  deductPartCost?: boolean;
  supplierNotes?: string;
  // New multi-item parts
  items?: RepairOrderItemInput[];
};

export type AssignableTechnician = {
  id: string;
  name: string;
  email: string;
};

export type UpdateRepairOrderDetailsInput = {
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceSerial?: string;
  reportedIssue?: string;
  diagnosis?: string;
  resolutionNotes?: string;
  estimatedTotal?: string;
  finalTotal?: string;
  dueAt?: string;
  status?: RepairStatus;
  // Legacy single part fields for backward compatibility
  supplierId?: string;
  supplierName?: string;
  partName?: string;
  partCost?: string;
  deductPartCost?: boolean;
  supplierNotes?: string;
  // New multi-item parts
  items?: RepairOrderItemInput[];
};

export type UpdateRepairOrderStatusInput = {
  status: RepairStatus;
  note?: string;
};

export function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decimalOrNull(value?: string | number | null) {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  if (!str) {
    return null;
  }

  const normalized = str.replace(",", ".");
  const parsed = Number(normalized);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Prisma.Decimal(parsed);
}

function dateOrNull(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function listAssignableTechnicians(shopId: string): Promise<AssignableTechnician[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      shopId,
      role: MembershipRole.TECHNICIAN,
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: { deletedAt: null },
    },
    select: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  return memberships.map(({ user }) => ({
    id: user.id,
    name: user.name?.trim() || "فني صيانة",
    email: user.email,
  }));
}

async function validateAssignableTechnician(
  db: Prisma.TransactionClient | typeof prisma,
  shopId: string,
  userId: string,
) {
  const membership = await db.membership.findFirst({
    where: {
      shopId,
      userId,
      role: MembershipRole.TECHNICIAN,
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
      user: { deletedAt: null },
    },
    select: { userId: true },
  });

  if (!membership) {
    throw new Error("لا يمكن إسناد التذكرة: الفني غير نشط أو لا ينتمي إلى هذا المتجر.");
  }
}

export async function findOrCreateCustomerForRepair(
  shopId: string,
  input: CreateRepairOrderInput,
) {
  const normalized = normalizePhone(input.customerPhone);

  if (normalized) {
    const existing = await prisma.customer.findFirst({
      where: {
        shopId,
        phoneNormalized: normalized,
        deletedAt: null,
      },
    });

    if (existing) {
      return existing;
    }
  }

  return prisma.customer.create({
    data: {
      shopId,
      name: input.customerName.trim(),
      phone: input.customerPhone.trim(),
      phoneNormalized: normalized,
      notes: emptyToNull(input.customerNotes),
    },
  });
}

export async function generateTicketNumber(
  shopId: string,
  txClient?: Prisma.TransactionClient,
) {
  const db = txClient ?? prisma;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `RO-${year}${month}-`;

  const count = await db.repairOrder.count({
    where: {
      shopId,
      ticketNumber: {
        startsWith: prefix,
      },
    },
  });

  for (let offset = 1; offset <= 50; offset += 1) {
    const ticketNumber = `${prefix}${String(count + offset).padStart(4, "0")}`;
    const existing = await db.repairOrder.findUnique({
      where: {
        shopId_ticketNumber: {
          shopId,
          ticketNumber,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return ticketNumber;
    }
  }

  return `${prefix}${Date.now().toString().slice(-4)}${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

export async function listRepairOrders(
  shopId: string,
  filters: RepairOrderListFilters = {},
) {
  const search = filters.search?.trim();
  const status =
    filters.status && filters.status !== "ALL" ? filters.status : undefined;
  const assignment = filters.assignment ?? "ALL";
  const assignmentWhere =
    assignment === "MINE" && filters.currentUserId
      ? { assignedToUserId: filters.currentUserId }
      : assignment === "UNASSIGNED"
        ? { assignedToUserId: null }
        : {};

  const orders = await prisma.repairOrder.findMany({
    where: {
      shopId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...assignmentWhere,
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: search, mode: "insensitive" } },
              { deviceModel: { contains: search, mode: "insensitive" } },
              { reportedIssue: { contains: search, mode: "insensitive" } },
              { supplierName: { contains: search, mode: "insensitive" } },
              { partName: { contains: search, mode: "insensitive" } },
              {
                customer: {
                  is: {
                    OR: [
                      { name: { contains: search, mode: "insensitive" } },
                      { phone: { contains: search, mode: "insensitive" } },
                      {
                        phoneNormalized: {
                          contains: search,
                          mode: "insensitive",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      customer: true,
      supplier: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  // Batched resolution of creators for the listed tickets
  const relatedUserIds = Array.from(
    new Set(
      orders
        .flatMap((order) => [order.createdByUserId, order.assignedToUserId])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const usersMap = new Map<string, { id: string; name: string; role: string }>();

  if (relatedUserIds.length > 0) {
    const [users, memberships] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: relatedUserIds } },
        select: { id: true, name: true, shopId: true, role: true },
      }),
      prisma.membership.findMany({
        where: { shopId, userId: { in: relatedUserIds } },
        select: { userId: true, role: true },
      }),
    ]);

    const roleMap = new Map<string, string>();
    for (const m of memberships) {
      roleMap.set(m.userId, m.role);
    }

    for (const u of users) {
      const shopRole = roleMap.get(u.id) || (u.shopId === shopId ? u.role : null);
      if (shopRole) {
        usersMap.set(u.id, {
          id: u.id,
          name: u.name?.trim() || "عضو فريق العمل",
          role: shopRole,
        });
      }
    }
  }

  return orders.map((order) => ({
    ...order,
    createdByUser: order.createdByUserId ? usersMap.get(order.createdByUserId) || null : null,
    assignedToUser: order.assignedToUserId ? usersMap.get(order.assignedToUserId) || null : null,
  }));
}

export async function getRepairOrderById(shopId: string, repairOrderId: string) {
  const repairOrder = await prisma.repairOrder.findFirst({
    where: {
      id: repairOrderId,
      shopId,
      deletedAt: null,
    },
    include: repairOrderInclude,
  });

  if (!repairOrder) {
    return null;
  }

  // Safely resolve creator and updater details scoped to the current shop
  const userIdsToFetch = [
    repairOrder.createdByUserId,
    repairOrder.updatedByUserId,
    repairOrder.assignedToUserId,
    repairOrder.assignedByUserId,
    ...repairOrder.assignmentHistory.flatMap((event) => [
      event.fromUserId,
      event.toUserId,
      event.changedByUserId,
    ]),
  ].filter((id): id is string => Boolean(id));

  const usersMap = new Map<string, { id: string; name: string; role: string }>();

  if (userIdsToFetch.length > 0) {
    const [users, memberships] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: { in: userIdsToFetch },
        },
        select: {
          id: true,
          name: true,
          shopId: true,
          role: true,
        },
      }),
      prisma.membership.findMany({
        where: {
          shopId,
          userId: { in: userIdsToFetch },
        },
        select: {
          userId: true,
          role: true,
        },
      }),
    ]);

    const roleMap = new Map<string, string>();
    for (const m of memberships) {
      roleMap.set(m.userId, m.role);
    }

    for (const u of users) {
      // Resolve role scoped to THIS shop (via Membership or shop owner fallback)
      const shopRole = roleMap.get(u.id) || (u.shopId === shopId ? u.role : null);
      if (shopRole) {
        usersMap.set(u.id, {
          id: u.id,
          name: u.name?.trim() || "عضو فريق العمل",
          role: shopRole,
        });
      }
    }
  }

  const createdByUser = repairOrder.createdByUserId
    ? usersMap.get(repairOrder.createdByUserId) || null
    : null;

  const updatedByUser = repairOrder.updatedByUserId
    ? usersMap.get(repairOrder.updatedByUserId) || null
    : null;

  const assignedToUser = repairOrder.assignedToUserId
    ? usersMap.get(repairOrder.assignedToUserId) || null
    : null;

  const assignedByUser = repairOrder.assignedByUserId
    ? usersMap.get(repairOrder.assignedByUserId) || null
    : null;

  return {
    ...repairOrder,
    createdByUser,
    updatedByUser,
    assignedToUser,
    assignedByUser,
    assignmentHistory: repairOrder.assignmentHistory.map((event) => ({
      ...event,
      fromUser: event.fromUserId ? usersMap.get(event.fromUserId) || null : null,
      toUser: event.toUserId ? usersMap.get(event.toUserId) || null : null,
      changedByUser: event.changedByUserId
        ? usersMap.get(event.changedByUserId) || null
        : null,
    })),
  };
}

/**
 * Concurrency-safe atomic deduction of inventory stock.
 * Returns unitCost snapshot and quantityAfter.
 */
async function deductInventoryStockAtomic(
  tx: Prisma.TransactionClient,
  shopId: string,
  inventoryItemId: string,
  quantityToDeduct: number,
  itemNameForError?: string,
) {
  if (quantityToDeduct <= 0) {
    throw new Error("يجب أن تكون كمية الخصم من المخزون أكبر من صفر.");
  }

  const item = await tx.inventoryItem.findFirst({
    where: { id: inventoryItemId, shopId, deletedAt: null },
    select: { id: true, name: true, unitCost: true, quantity: true },
  });

  if (!item) {
    throw new Error(`قطعة المخزون غير موجودة أو تم حذفها: ${itemNameForError ?? inventoryItemId}`);
  }
  const affectedCount = await tx.$executeRaw`
    UPDATE "InventoryItem"
    SET "quantity" = "quantity" - ${quantityToDeduct},
        "updatedAt" = NOW()
    WHERE "id" = ${inventoryItemId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "quantity" >= ${quantityToDeduct}
  `;

  if (affectedCount === 0) {
    throw new Error(
      `الكمية المتوفرة في المخزون غير كافية للقطعة: "${item.name}". المتوفر حالياً (${item.quantity}) والمطلوب (${quantityToDeduct}).`
    );
  }

  return {
    unitCost: item.unitCost,
    quantityAfter: item.quantity - quantityToDeduct,
    name: item.name,
  };
}

/**
 * Concurrency-safe atomic restoration of inventory stock.
 */
async function restoreInventoryStockAtomic(
  tx: Prisma.TransactionClient,
  shopId: string,
  inventoryItemId: string,
  quantityToRestore: number,
) {
  if (quantityToRestore <= 0) {
    return { unitCost: null, quantityAfter: 0, name: "" };
  }

  const item = await tx.inventoryItem.findFirst({
    where: { id: inventoryItemId, shopId, deletedAt: null },
    select: { id: true, name: true, unitCost: true, quantity: true },
  });

  if (!item) {
    throw new Error("تعذر إرجاع القطعة لأن عنصر المخزون غير موجود في المتجر.");
  }

  await tx.$executeRaw`
    UPDATE "InventoryItem"
    SET "quantity" = "quantity" + ${quantityToRestore},
        "updatedAt" = NOW()
    WHERE "id" = ${inventoryItemId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
  `;

  return {
    unitCost: item.unitCost,
    quantityAfter: item.quantity + quantityToRestore,
    name: item.name,
  };
}

async function resolveSupplierForPart(
  tx: Prisma.TransactionClient,
  shopId: string,
  supplierId?: string | null,
  supplierName?: string | null,
) {
  let resolvedId = supplierId ? supplierId.trim() : null;
  let resolvedName = supplierName ? supplierName.trim() : null;

  if (resolvedName && !resolvedId) {
    const existingSupplier = await tx.supplier.findFirst({
      where: {
        shopId,
        deletedAt: null,
        name: { equals: resolvedName, mode: "insensitive" },
      },
    });
    if (existingSupplier) {
      resolvedId = existingSupplier.id;
      resolvedName = existingSupplier.name;
    } else {
      const newSupplier = await tx.supplier.create({
        data: {
          shopId,
          name: resolvedName,
        },
      });
      resolvedId = newSupplier.id;
    }
  } else if (resolvedId && !resolvedName) {
    const existingSupplier = await tx.supplier.findFirst({
      where: { id: resolvedId, shopId, deletedAt: null },
      select: { name: true },
    });
    if (existingSupplier) {
      resolvedName = existingSupplier.name;
    }
  }

  return { supplierId: resolvedId, supplierName: resolvedName };
}

export async function createRepairOrder(
  shopId: string,
  createdByUserId: string | null,
  input: CreateRepairOrderInput,
) {
  const customer = await findOrCreateCustomerForRepair(shopId, input);

  return prisma.$transaction(async (tx) => {
    const ticketNumber = await generateTicketNumber(shopId, tx);

    if (input.assignedToUserId) {
      await validateAssignableTechnician(tx, shopId, input.assignedToUserId);
    }

    // 1. Resolve main supplier if legacy supplier fields are provided
    const mainSupplier = await resolveSupplierForPart(
      tx,
      shopId,
      input.supplierId,
      input.supplierName,
    );

    // 2. Create base RepairOrder
    const repairOrder = await tx.repairOrder.create({
      data: {
        shopId,
        customerId: customer.id,
        createdByUserId,
        updatedByUserId: createdByUserId,
        assignedToUserId: input.assignedToUserId || null,
        assignedByUserId: input.assignedToUserId ? createdByUserId : null,
        assignedAt: input.assignedToUserId ? new Date() : null,
        assignmentSeenAt: null,
        ticketNumber,
        status: RepairStatus.PENDING,
        deviceBrand: emptyToNull(input.deviceBrand),
        deviceModel: emptyToNull(input.deviceModel),
        deviceSerial: emptyToNull(input.deviceSerial),
        reportedIssue: input.reportedIssue.trim(),
        resolutionNotes: emptyToNull(input.notes),
        estimatedTotal: decimalOrNull(input.estimatedTotal),
        supplierId: mainSupplier.supplierId,
        supplierName: mainSupplier.supplierName,
        partName: emptyToNull(input.partName),
        partCost: decimalOrNull(input.partCost),
        deductPartCost: input.deductPartCost ?? true,
        supplierNotes: emptyToNull(input.supplierNotes),
        dueAt: dateOrNull(input.dueAt),
      },
    });

    await tx.repairStatusHistory.create({
      data: {
        shopId,
        repairOrderId: repairOrder.id,
        createdByUserId,
        fromStatus: null,
        toStatus: RepairStatus.PENDING,
        note: "تم إنشاء طلب الصيانة",
      },
    });

    if (input.assignedToUserId) {
      await tx.repairOrderAssignmentHistory.create({
        data: {
          shopId,
          repairOrderId: repairOrder.id,
          fromUserId: null,
          toUserId: input.assignedToUserId,
          changedByUserId: createdByUserId,
        },
      });
    }

    // 3. Process RepairOrderItems & Atomic Inventory Deduction
    let totalItemsCost = new Prisma.Decimal(0);
    const itemsList = input.items ?? [];

    if (itemsList.length > 0) {
      for (const itemInput of itemsList) {
        const qty = Number(itemInput.quantity) || 1;
        const partName = itemInput.partName.trim();
        const inventoryItemId = emptyToNull(itemInput.inventoryItemId);

        if (!partName) {
          throw new Error("يجب تحديد اسم أو وصف لقطعة الغيار.");
        }

        if (inventoryItemId) {
          // Internal Inventory Item -> Atomic Deduction & Backend UnitCost Authority
          const deduction = await deductInventoryStockAtomic(
            tx,
            shopId,
            inventoryItemId,
            qty,
            partName,
          );

          const unitCost = deduction.unitCost ?? new Prisma.Decimal(0);
          const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

          const createdItem = await tx.repairOrderItem.create({
            data: {
              shopId,
              repairOrderId: repairOrder.id,
              inventoryItemId,
              partName: deduction.name || partName,
              quantity: qty,
              unitCost,
              unitPrice,
              notes: emptyToNull(itemInput.notes ?? undefined),
            },
          });

          await tx.inventoryMovement.create({
            data: {
              shopId,
              inventoryItemId,
              repairOrderId: repairOrder.id,
              repairOrderItemId: createdItem.id,
              createdByUserId,
              type: "REPAIR_USAGE",
              quantityChange: -qty,
              quantityAfter: deduction.quantityAfter,
              unitCostSnapshot: unitCost,
              note: `استخدام في تذكرة صيانة رقم (${ticketNumber})`,
            },
          });

          totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
        } else {
          // External Supplier Part
          const itemSupplier = await resolveSupplierForPart(
            tx,
            shopId,
            itemInput.supplierId,
            itemInput.supplierName,
          );

          const unitCost = decimalOrNull(String(itemInput.unitCost ?? "")) ?? new Prisma.Decimal(0);
          const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

          await tx.repairOrderItem.create({
            data: {
              shopId,
              repairOrderId: repairOrder.id,
              supplierId: itemSupplier.supplierId,
              supplierName: itemSupplier.supplierName,
              partName,
              quantity: qty,
              unitCost,
              unitPrice,
              notes: emptyToNull(itemInput.notes ?? undefined),
            },
          });

          totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
        }
      }

      // Synchronize overall partCost and summary on RepairOrder
      const partSummary = itemsList.map((i) => i.partName.trim()).filter(Boolean).join("، ");
      await tx.repairOrder.update({
        where: { id: repairOrder.id },
        data: {
          partCost: totalItemsCost.gt(0) ? totalItemsCost : repairOrder.partCost,
          partName: partSummary || repairOrder.partName,
        },
      });
    } else if (input.partName) {
      // Legacy fallback single item creation
      const legacyCost = decimalOrNull(input.partCost) ?? new Prisma.Decimal(0);
      await tx.repairOrderItem.create({
        data: {
          shopId,
          repairOrderId: repairOrder.id,
          supplierId: mainSupplier.supplierId,
          supplierName: mainSupplier.supplierName,
          partName: input.partName.trim(),
          quantity: 1,
          unitCost: legacyCost,
          notes: emptyToNull(input.supplierNotes),
        },
      });
    }

    return repairOrder;
  });
}

export async function assignRepairOrder(
  shopId: string,
  repairOrderId: string,
  changedByUserId: string,
  assignedToUserId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.repairOrder.findFirst({
      where: { id: repairOrderId, shopId, deletedAt: null },
      select: { id: true, assignedToUserId: true },
    });

    if (!existing) {
      throw new Error("تذكرة الصيانة غير موجودة.");
    }

    if (assignedToUserId) {
      await validateAssignableTechnician(tx, shopId, assignedToUserId);
    }

    if (existing.assignedToUserId === assignedToUserId) {
      return existing;
    }

    const updated = await tx.repairOrder.update({
      where: { id: existing.id },
      data: {
        assignedToUserId,
        assignedByUserId: changedByUserId,
        assignedAt: assignedToUserId ? new Date() : null,
        assignmentSeenAt: null,
        updatedByUserId: changedByUserId,
      },
    });

    await tx.repairOrderAssignmentHistory.create({
      data: {
        shopId,
        repairOrderId: existing.id,
        fromUserId: existing.assignedToUserId,
        toUserId: assignedToUserId,
        changedByUserId,
      },
    });

    return updated;
  });
}

export async function markRepairAssignmentSeen(
  shopId: string,
  repairOrderId: string,
  userId: string,
) {
  return prisma.repairOrder.updateMany({
    where: {
      id: repairOrderId,
      shopId,
      assignedToUserId: userId,
      assignmentSeenAt: null,
      deletedAt: null,
    },
    data: { assignmentSeenAt: new Date() },
  });
}

export async function updateRepairOrderDetails(
  shopId: string,
  repairOrderId: string,
  updatedByUserId: string | null,
  input: UpdateRepairOrderDetailsInput,
) {
  const existing = await prisma.repairOrder.findFirst({
    where: {
      id: repairOrderId,
      shopId,
      deletedAt: null,
    },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      customerId: true,
      completedAt: true,
      deliveredAt: true,
    },
  });

  if (!existing) {
    throw new Error("طلب الصيانة غير موجود.");
  }

  return prisma.$transaction(async (tx) => {
    // 0. Handle Customer update if customer info is provided
    let updatedCustomerId = existing.customerId;
    if (input.customerName !== undefined || input.customerPhone !== undefined || input.customerNotes !== undefined) {
      if (existing.customerId) {
        const normPhone = input.customerPhone !== undefined ? normalizePhone(input.customerPhone) : undefined;
        await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            ...(input.customerName !== undefined && input.customerName.trim() ? { name: input.customerName.trim() } : {}),
            ...(input.customerPhone !== undefined ? { phone: emptyToNull(input.customerPhone), phoneNormalized: normPhone } : {}),
            ...(input.customerNotes !== undefined ? { notes: emptyToNull(input.customerNotes) } : {}),
            version: { increment: 1 },
          },
        });
      } else if (input.customerName && input.customerPhone) {
        const newCustomer = await findOrCreateCustomerForRepair(shopId, {
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerNotes: input.customerNotes,
          reportedIssue: input.reportedIssue ?? "",
        });
        updatedCustomerId = newCustomer.id;
      }
    }

    // 0.1 Handle Status change if provided
    let newStatus = existing.status;
    let completedAt = existing.completedAt;
    let deliveredAt = existing.deliveredAt;

    if (input.status && input.status !== existing.status) {
      newStatus = input.status;
      const now = new Date();

      // If transitioning to CANCELLED, restore inventory items
      if (input.status === RepairStatus.CANCELLED) {
        const activeItems = await tx.repairOrderItem.findMany({
          where: {
            repairOrderId,
            shopId,
            deletedAt: null,
            inventoryItemId: { not: null },
          },
        });

        for (const item of activeItems) {
          if (item.inventoryItemId) {
            const movements = await tx.inventoryMovement.findMany({
              where: {
                shopId,
                repairOrderId,
                repairOrderItemId: item.id,
                deletedAt: null,
              },
              select: { quantityChange: true },
            });
            const netChange = movements.reduce((sum, m) => sum + m.quantityChange, 0);
            const unreturned = -netChange;
            if (unreturned > 0) {
              const restoration = await restoreInventoryStockAtomic(
                tx,
                shopId,
                item.inventoryItemId,
                unreturned,
              );

              await tx.inventoryMovement.create({
                data: {
                  shopId,
                  inventoryItemId: item.inventoryItemId,
                  repairOrderId,
                  repairOrderItemId: item.id,
                  createdByUserId: updatedByUserId,
                  type: "REPAIR_RETURN",
                  quantityChange: unreturned,
                  quantityAfter: restoration.quantityAfter,
                  unitCostSnapshot: restoration.unitCost,
                  note: `إرجاع للمخزون بسبب إلغاء تذكرة الصيانة (${existing.ticketNumber})`,
                },
              });
            }
          }
        }
      }

      if (input.status === RepairStatus.DONE && !completedAt) {
        completedAt = now;
      }
      if (input.status === RepairStatus.DELIVERED) {
        if (!completedAt) completedAt = now;
        if (!deliveredAt) deliveredAt = now;
      }

      await tx.repairStatusHistory.create({
        data: {
          shopId,
          repairOrderId,
          createdByUserId: updatedByUserId,
          fromStatus: existing.status,
          toStatus: input.status,
          note: "تم تحديث حالة التذكرة أثناء تعديل البيانات",
        },
      });
    }

    // 1. Resolve main supplier if passed
    const mainSupplier = await resolveSupplierForPart(
      tx,
      shopId,
      input.supplierId,
      input.supplierName,
    );

    // 2. Handle items delta if items are explicitly passed
    let totalItemsCost = new Prisma.Decimal(0);

    if (input.items !== undefined) {
      const existingItems = await tx.repairOrderItem.findMany({
        where: {
          repairOrderId,
          shopId,
          deletedAt: null,
        },
      });

      const existingMap = new Map(existingItems.map((item) => [item.id, item]));
      const incomingIds = new Set(
        input.items.map((i) => i.id).filter((id): id is string => Boolean(id)),
      );

      // A. Process DELETIONS (items removed from list)
      for (const oldItem of existingItems) {
        if (!incomingIds.has(oldItem.id)) {
          if (oldItem.inventoryItemId) {
            // Check net unreturned consumed movements
            const movements = await tx.inventoryMovement.findMany({
              where: {
                shopId,
                repairOrderId,
                repairOrderItemId: oldItem.id,
                deletedAt: null,
              },
              select: { quantityChange: true },
            });
            const netChange = movements.reduce((sum, m) => sum + m.quantityChange, 0);
            const unreturned = -netChange; // USAGE is negative, so netChange is -qty

            if (unreturned > 0) {
              const restoration = await restoreInventoryStockAtomic(
                tx,
                shopId,
                oldItem.inventoryItemId,
                unreturned,
              );

              await tx.inventoryMovement.create({
                data: {
                  shopId,
                  inventoryItemId: oldItem.inventoryItemId,
                  repairOrderId,
                  repairOrderItemId: oldItem.id,
                  createdByUserId: updatedByUserId,
                  type: "REPAIR_RETURN",
                  quantityChange: unreturned,
                  quantityAfter: restoration.quantityAfter,
                  unitCostSnapshot: restoration.unitCost,
                  note: `إرجاع قطعة بعد حذفها من تذكرة الصيانة (${existing.ticketNumber})`,
                },
              });
            }
          }

          // Soft delete item
          await tx.repairOrderItem.update({
            where: { id: oldItem.id },
            data: { deletedAt: new Date() },
          });
        }
      }

      // B. Process UPDATES & ADDITIONS
      for (const itemInput of input.items) {
        const qty = Math.max(1, Number(itemInput.quantity) || 1);
        const partName = itemInput.partName.trim();
        const inventoryItemId = emptyToNull(itemInput.inventoryItemId);

        if (!partName) {
          throw new Error("يجب إدخال اسم أو وصف لقطعة الغيار.");
        }

        if (itemInput.id && existingMap.has(itemInput.id)) {
          // --- EXISTING ITEM UPDATE (Delta logic) ---
          const oldItem = existingMap.get(itemInput.id)!;

          if (oldItem.inventoryItemId === inventoryItemId) {
            if (inventoryItemId) {
              // Same internal inventory item: calculate quantity difference
              const deltaQty = qty - oldItem.quantity;

              if (deltaQty > 0) {
                // Deduct additional stock
                const deduction = await deductInventoryStockAtomic(
                  tx,
                  shopId,
                  inventoryItemId,
                  deltaQty,
                  partName,
                );

                await tx.inventoryMovement.create({
                  data: {
                    shopId,
                    inventoryItemId,
                    repairOrderId,
                    repairOrderItemId: oldItem.id,
                    createdByUserId: updatedByUserId,
                    type: "REPAIR_USAGE",
                    quantityChange: -deltaQty,
                    quantityAfter: deduction.quantityAfter,
                    unitCostSnapshot: oldItem.unitCost ?? deduction.unitCost,
                    note: `زيادة كمية مستهلكة في تذكرة الصيانة (${existing.ticketNumber})`,
                  },
                });
              } else if (deltaQty < 0) {
                // Return difference
                const returnQty = -deltaQty;
                const restoration = await restoreInventoryStockAtomic(
                  tx,
                  shopId,
                  inventoryItemId,
                  returnQty,
                );

                await tx.inventoryMovement.create({
                  data: {
                    shopId,
                    inventoryItemId,
                    repairOrderId,
                    repairOrderItemId: oldItem.id,
                    createdByUserId: updatedByUserId,
                    type: "REPAIR_RETURN",
                    quantityChange: returnQty,
                    quantityAfter: restoration.quantityAfter,
                    unitCostSnapshot: oldItem.unitCost ?? restoration.unitCost,
                    note: `تقليل كمية مستهلكة في تذكرة الصيانة (${existing.ticketNumber})`,
                  },
                });
              }

              const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));
              await tx.repairOrderItem.update({
                where: { id: oldItem.id },
                data: {
                  partName,
                  quantity: qty,
                  unitPrice,
                  notes: emptyToNull(itemInput.notes ?? undefined),
                },
              });

              const cost = oldItem.unitCost ?? new Prisma.Decimal(0);
              totalItemsCost = totalItemsCost.add(cost.mul(qty));
            } else {
              // External item update
              const itemSupplier = await resolveSupplierForPart(
                tx,
                shopId,
                itemInput.supplierId,
                itemInput.supplierName,
              );
              const unitCost = decimalOrNull(String(itemInput.unitCost ?? "")) ?? oldItem.unitCost ?? new Prisma.Decimal(0);
              const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

              await tx.repairOrderItem.update({
                where: { id: oldItem.id },
                data: {
                  partName,
                  quantity: qty,
                  unitCost,
                  unitPrice,
                  supplierId: itemSupplier.supplierId,
                  supplierName: itemSupplier.supplierName,
                  notes: emptyToNull(itemInput.notes ?? undefined),
                },
              });

              totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
            }
          } else {
            // Inventory item changed (e.g. from item A to B, or internal to external)
            if (oldItem.inventoryItemId) {
              // Restore old item
              const restoration = await restoreInventoryStockAtomic(
                tx,
                shopId,
                oldItem.inventoryItemId,
                oldItem.quantity,
              );
              await tx.inventoryMovement.create({
                data: {
                  shopId,
                  inventoryItemId: oldItem.inventoryItemId,
                  repairOrderId,
                  repairOrderItemId: oldItem.id,
                  createdByUserId: updatedByUserId,
                  type: "REPAIR_RETURN",
                  quantityChange: oldItem.quantity,
                  quantityAfter: restoration.quantityAfter,
                  unitCostSnapshot: restoration.unitCost,
                  note: `استبدال قطعة في تذكرة الصيانة (${existing.ticketNumber})`,
                },
              });
            }

            if (inventoryItemId) {
              // Deduct new item
              const deduction = await deductInventoryStockAtomic(
                tx,
                shopId,
                inventoryItemId,
                qty,
                partName,
              );
              const unitCost = deduction.unitCost ?? new Prisma.Decimal(0);
              const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

              await tx.repairOrderItem.update({
                where: { id: oldItem.id },
                data: {
                  inventoryItemId,
                  supplierId: null,
                  supplierName: null,
                  partName: deduction.name || partName,
                  quantity: qty,
                  unitCost,
                  unitPrice,
                  notes: emptyToNull(itemInput.notes ?? undefined),
                },
              });

              await tx.inventoryMovement.create({
                data: {
                  shopId,
                  inventoryItemId,
                  repairOrderId,
                  repairOrderItemId: oldItem.id,
                  createdByUserId: updatedByUserId,
                  type: "REPAIR_USAGE",
                  quantityChange: -qty,
                  quantityAfter: deduction.quantityAfter,
                  unitCostSnapshot: unitCost,
                  note: `استخدام قطعة بديلة في تذكرة الصيانة (${existing.ticketNumber})`,
                },
              });

              totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
            } else {
              // Now external
              const itemSupplier = await resolveSupplierForPart(
                tx,
                shopId,
                itemInput.supplierId,
                itemInput.supplierName,
              );
              const unitCost = decimalOrNull(String(itemInput.unitCost ?? "")) ?? new Prisma.Decimal(0);
              const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

              await tx.repairOrderItem.update({
                where: { id: oldItem.id },
                data: {
                  inventoryItemId: null,
                  supplierId: itemSupplier.supplierId,
                  supplierName: itemSupplier.supplierName,
                  partName,
                  quantity: qty,
                  unitCost,
                  unitPrice,
                  notes: emptyToNull(itemInput.notes ?? undefined),
                },
              });

              totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
            }
          }
        } else {
          // --- NEW ITEM ADDITION ---
          if (inventoryItemId) {
            const deduction = await deductInventoryStockAtomic(
              tx,
              shopId,
              inventoryItemId,
              qty,
              partName,
            );

            const unitCost = deduction.unitCost ?? new Prisma.Decimal(0);
            const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

            const createdItem = await tx.repairOrderItem.create({
              data: {
                shopId,
                repairOrderId,
                inventoryItemId,
                partName: deduction.name || partName,
                quantity: qty,
                unitCost,
                unitPrice,
                notes: emptyToNull(itemInput.notes ?? undefined),
              },
            });

            await tx.inventoryMovement.create({
              data: {
                shopId,
                inventoryItemId,
                repairOrderId,
                repairOrderItemId: createdItem.id,
                createdByUserId: updatedByUserId,
                type: "REPAIR_USAGE",
                quantityChange: -qty,
                quantityAfter: deduction.quantityAfter,
                unitCostSnapshot: unitCost,
                note: `إضافة قطعة مستهلكة لتذكرة الصيانة (${existing.ticketNumber})`,
              },
            });

            totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
          } else {
            const itemSupplier = await resolveSupplierForPart(
              tx,
              shopId,
              itemInput.supplierId,
              itemInput.supplierName,
            );
            const unitCost = decimalOrNull(String(itemInput.unitCost ?? "")) ?? new Prisma.Decimal(0);
            const unitPrice = decimalOrNull(String(itemInput.unitPrice ?? ""));

            await tx.repairOrderItem.create({
              data: {
                shopId,
                repairOrderId,
                supplierId: itemSupplier.supplierId,
                supplierName: itemSupplier.supplierName,
                partName,
                quantity: qty,
                unitCost,
                unitPrice,
                notes: emptyToNull(itemInput.notes ?? undefined),
              },
            });

            totalItemsCost = totalItemsCost.add(unitCost.mul(qty));
          }
        }
      }
    }

    // 3. Update RepairOrder record
    const partSummary = input.items !== undefined
      ? input.items.map((i) => i.partName.trim()).filter(Boolean).join("، ")
      : undefined;

    return tx.repairOrder.update({
      where: {
        id: repairOrderId,
      },
      data: {
        customerId: updatedCustomerId,
        updatedByUserId,
        status: newStatus,
        completedAt,
        deliveredAt,
        deviceBrand: emptyToNull(input.deviceBrand),
        deviceModel: emptyToNull(input.deviceModel),
        deviceSerial: emptyToNull(input.deviceSerial),
        reportedIssue: input.reportedIssue?.trim(),
        diagnosis: emptyToNull(input.diagnosis),
        resolutionNotes: emptyToNull(input.resolutionNotes),
        estimatedTotal: decimalOrNull(input.estimatedTotal),
        finalTotal: decimalOrNull(input.finalTotal),
        supplierId: mainSupplier.supplierId,
        supplierName: mainSupplier.supplierName,
        partName: partSummary !== undefined ? partSummary || null : (input.partName !== undefined ? emptyToNull(input.partName) : undefined),
        partCost: input.items !== undefined ? (totalItemsCost.gt(0) ? totalItemsCost : null) : (input.partCost !== undefined ? decimalOrNull(input.partCost) : undefined),
        deductPartCost: input.deductPartCost !== undefined ? input.deductPartCost : undefined,
        supplierNotes: input.supplierNotes !== undefined ? emptyToNull(input.supplierNotes) : undefined,
        dueAt: dateOrNull(input.dueAt),
        version: {
          increment: 1,
        },
      },
    });
  });
}

export async function updateRepairOrderStatus(
  shopId: string,
  repairOrderId: string,
  updatedByUserId: string | null,
  input: UpdateRepairOrderStatusInput,
) {
  const repairOrder = await prisma.repairOrder.findFirst({
    where: {
      id: repairOrderId,
      shopId,
      deletedAt: null,
    },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      completedAt: true,
      deliveredAt: true,
    },
  });

  if (!repairOrder) {
    throw new Error("طلب الصيانة غير موجود.");
  }

  const oldStatus = repairOrder.status;

  if (oldStatus === input.status) {
    return repairOrder;
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // 1. Double-reversal prevention: handle stock return on cancellation
    if (input.status === RepairStatus.CANCELLED && oldStatus !== RepairStatus.CANCELLED) {
      const activeItems = await tx.repairOrderItem.findMany({
        where: {
          repairOrderId,
          shopId,
          deletedAt: null,
          inventoryItemId: { not: null },
        },
      });

      for (const item of activeItems) {
        if (item.inventoryItemId) {
          // Calculate net unreturned quantity
          const movements = await tx.inventoryMovement.findMany({
            where: {
              shopId,
              repairOrderId,
              repairOrderItemId: item.id,
              deletedAt: null,
            },
            select: { quantityChange: true },
          });

          const netChange = movements.reduce((sum, m) => sum + m.quantityChange, 0);
          const unreturned = -netChange;

          if (unreturned > 0) {
            const restoration = await restoreInventoryStockAtomic(
              tx,
              shopId,
              item.inventoryItemId,
              unreturned,
            );

            await tx.inventoryMovement.create({
              data: {
                shopId,
                inventoryItemId: item.inventoryItemId,
                repairOrderId,
                repairOrderItemId: item.id,
                createdByUserId: updatedByUserId,
                type: "REPAIR_RETURN",
                quantityChange: unreturned,
                quantityAfter: restoration.quantityAfter,
                unitCostSnapshot: restoration.unitCost,
                note: `استرجاع قطعة بسبب إلغاء تذكرة الصيانة (${repairOrder.ticketNumber})`,
              },
            });
          }
        }
      }
    } else if (oldStatus === RepairStatus.CANCELLED && input.status !== RepairStatus.CANCELLED) {
      // Re-activating a cancelled ticket: re-deduct items
      const activeItems = await tx.repairOrderItem.findMany({
        where: {
          repairOrderId,
          shopId,
          deletedAt: null,
          inventoryItemId: { not: null },
        },
      });

      for (const item of activeItems) {
        if (item.inventoryItemId) {
          const movements = await tx.inventoryMovement.findMany({
            where: {
              shopId,
              repairOrderId,
              repairOrderItemId: item.id,
              deletedAt: null,
            },
            select: { quantityChange: true },
          });

          const netChange = movements.reduce((sum, m) => sum + m.quantityChange, 0);
          // If netChange is 0, item was fully returned and needs to be re-deducted
          if (netChange === 0 && item.quantity > 0) {
            const deduction = await deductInventoryStockAtomic(
              tx,
              shopId,
              item.inventoryItemId,
              item.quantity,
              item.partName,
            );

            await tx.inventoryMovement.create({
              data: {
                shopId,
                inventoryItemId: item.inventoryItemId,
                repairOrderId,
                repairOrderItemId: item.id,
                createdByUserId: updatedByUserId,
                type: "REPAIR_USAGE",
                quantityChange: -item.quantity,
                quantityAfter: deduction.quantityAfter,
                unitCostSnapshot: deduction.unitCost,
                note: `إعادة خصم القطعة بعد إلغاء إلغاء التذكرة (${repairOrder.ticketNumber})`,
              },
            });
          }
        }
      }
    }

    // 2. Update status and history
    const updatedRepairOrder = await tx.repairOrder.update({
      where: { id: repairOrderId },
      data: {
        status: input.status,
        updatedByUserId,
        completedAt:
          input.status === RepairStatus.DONE && !repairOrder.completedAt
            ? now
            : repairOrder.completedAt,
        deliveredAt:
          input.status === RepairStatus.DELIVERED && !repairOrder.deliveredAt
            ? now
            : repairOrder.deliveredAt,
        version: {
          increment: 1,
        },
      },
    });

    await tx.repairStatusHistory.create({
      data: {
        shopId,
        repairOrderId,
        createdByUserId: updatedByUserId,
        fromStatus: oldStatus,
        toStatus: input.status,
        note: emptyToNull(input.note),
      },
    });

    return updatedRepairOrder;
  });
}

export async function deleteRepairOrder(
  shopId: string,
  repairOrderId: string,
  updatedByUserId: string | null,
) {
  const repairOrder = await prisma.repairOrder.findFirst({
    where: {
      id: repairOrderId,
      shopId,
      deletedAt: null,
    },
    include: {
      invoices: {
        where: {
          deletedAt: null,
          status: {
            in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID],
          },
        },
      },
    },
  });

  if (!repairOrder) {
    throw new Error("طلب الصيانة غير موجود أو تم حذفه مسبقاً.");
  }

  if (repairOrder.invoices.length > 0) {
    throw new Error("لا يمكن حذف طلب الصيانة لوجود فاتورة مدفوعة مرتبطة به. يرجى إلغاء أو حذف الفاتورة أولاً.");
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // If not already cancelled, return unreturned internal stock
    if (repairOrder.status !== RepairStatus.CANCELLED) {
      const activeItems = await tx.repairOrderItem.findMany({
        where: {
          repairOrderId,
          shopId,
          deletedAt: null,
          inventoryItemId: { not: null },
        },
      });

      for (const item of activeItems) {
        if (item.inventoryItemId) {
          const movements = await tx.inventoryMovement.findMany({
            where: {
              shopId,
              repairOrderId,
              repairOrderItemId: item.id,
              deletedAt: null,
            },
            select: { quantityChange: true },
          });

          const netChange = movements.reduce((sum, m) => sum + m.quantityChange, 0);
          const unreturned = -netChange;

          if (unreturned > 0) {
            const restoration = await restoreInventoryStockAtomic(
              tx,
              shopId,
              item.inventoryItemId,
              unreturned,
            );

            await tx.inventoryMovement.create({
              data: {
                shopId,
                inventoryItemId: item.inventoryItemId,
                repairOrderId,
                repairOrderItemId: item.id,
                createdByUserId: updatedByUserId,
                type: "REPAIR_RETURN",
                quantityChange: unreturned,
                quantityAfter: restoration.quantityAfter,
                unitCostSnapshot: restoration.unitCost,
                note: `استرجاع قطعة بسبب حذف تذكرة الصيانة (${repairOrder.ticketNumber})`,
              },
            });
          }
        }
      }
    }

    // Soft delete items
    await tx.repairOrderItem.updateMany({
      where: { repairOrderId, shopId, deletedAt: null },
      data: { deletedAt: now },
    });

    // Soft delete repair order
    const deletedOrder = await tx.repairOrder.update({
      where: { id: repairOrderId },
      data: {
        deletedAt: now,
        updatedByUserId,
      },
    });

    // Soft delete unpaid invoices
    await tx.invoice.updateMany({
      where: {
        repairOrderId,
        shopId,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });

    return deletedOrder;
  });
}

export const repairOrderService = {
  listRepairOrders,
  listAssignableTechnicians,
  getRepairOrderById,
  createRepairOrder,
  assignRepairOrder,
  markRepairAssignmentSeen,
  updateRepairOrderDetails,
  updateRepairOrderStatus,
  deleteRepairOrder,
  generateTicketNumber,
  findOrCreateCustomerForRepair,
  normalizePhone,
};
