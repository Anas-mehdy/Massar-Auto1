import { prisma } from "@/lib/prisma";

export type CustomerFilters = {
  search?: string;
};

export type CreateCustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type UpdateCustomerInput = CreateCustomerInput;

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizePhone(phone?: string | null) {
  const trimmed = phone?.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

export async function createCustomer(shopId: string, input: CreateCustomerInput) {
  const name = input.name.trim();
  if (!name) throw new Error("اسم العميل مطلوب.");
  const phone = emptyToNull(input.phone);
  const phoneNormalized = normalizePhone(phone);

  if (phoneNormalized) {
    const existing = await prisma.customer.findFirst({
      where: {
        shopId,
        deletedAt: null,
        phoneNormalized,
      },
      select: { id: true, name: true },
    });

    if (existing) {
      throw new Error(`يوجد عميل مسجل بهذا الرقم بالفعل: ${existing.name}. استخدم العميل الموجود بدلاً من إنشاء سجل مكرر.`);
    }
  }

  return prisma.customer.create({
    data: {
      shopId,
      name,
      phone,
      phoneNormalized,
      email: emptyToNull(input.email),
      notes: emptyToNull(input.notes),
    },
    select: { id: true, name: true, phone: true, email: true },
  });
}

export async function listCustomers(shopId: string, filters: CustomerFilters = {}) {
  const search = filters.search?.trim();
  return prisma.customer.findMany({
    where: {
      shopId,
      deletedAt: null,
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { phoneNormalized: { contains: search, mode: "insensitive" } },
      ] } : {}),
    },
    include: {
      _count: {
        select: {
          vehicles: { where: { deletedAt: null } },
          autoServiceOrders: { where: { deletedAt: null } },
          sales: { where: { deletedAt: null } },
          invoices: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getCustomerById(shopId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, shopId, deletedAt: null },
    include: {
      vehicles: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          plateNumber: true,
          currentOdometer: true,
          updatedAt: true,
        },
      },
      autoServiceOrders: {
        where: { deletedAt: null },
        orderBy: { receivedAt: "desc" },
        take: 20,
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
            },
          },
        },
      },
      sales: {
        where: { deletedAt: null },
        orderBy: { soldAt: "desc" },
        take: 20,
      },
      invoices: {
        where: { deletedAt: null },
        orderBy: { issuedAt: "desc" },
        take: 20,
      },
      _count: {
        select: {
          vehicles: { where: { deletedAt: null } },
          autoServiceOrders: { where: { deletedAt: null } },
          repairOrders: { where: { deletedAt: null } },
          sales: { where: { deletedAt: null } },
          invoices: { where: { deletedAt: null } },
        },
      },
    },
  });
}

export async function updateCustomer(shopId: string, customerId: string, input: UpdateCustomerInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new Error("العميل غير موجود.");
  const phone = emptyToNull(input.phone);
  return prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: input.name.trim(),
      phone,
      phoneNormalized: normalizePhone(phone),
      email: emptyToNull(input.email),
      notes: emptyToNull(input.notes),
      version: { increment: 1 },
    },
  });
}

export async function softDeleteCustomer(shopId: string, customerId: string) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, shopId, deletedAt: null },
      include: {
        _count: {
          select: {
            vehicles: { where: { deletedAt: null } },
            autoServiceOrders: { where: { deletedAt: null } },
            repairOrders: { where: { deletedAt: null } },
            sales: { where: { deletedAt: null } },
            invoices: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!customer) throw new Error("العميل غير موجود.");

    const [installmentCount, debtRows] = await Promise.all([
      tx.installmentPlan.count({ where: { shopId, customerId, deletedAt: null } }),
      tx.$queryRaw<Array<{ count: bigint | number | string }>>`
        SELECT COUNT(*) AS count
        FROM "DebtLedgerAccount"
        WHERE "shopId" = ${shopId}::uuid
          AND "customerId" = ${customerId}::uuid
      `,
    ]);

    const debtAccountCount = Number(debtRows[0]?.count ?? 0);
    const linkedRecords =
      customer._count.vehicles +
      customer._count.autoServiceOrders +
      customer._count.repairOrders +
      customer._count.sales +
      customer._count.invoices +
      installmentCount +
      debtAccountCount;

    if (linkedRecords > 0) {
      throw new Error("لا يمكن حذف عميل لديه مركبة أو أمر صيانة أو مبيعات أو فواتير أو أقساط أو دفتر ديون مرتبط.");
    }

    return tx.customer.update({
      where: { id: customer.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  });
}

export const customerService = {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  softDeleteCustomer,
  normalizePhone,
};
