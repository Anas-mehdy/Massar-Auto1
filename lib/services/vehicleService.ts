import { prisma } from "@/lib/prisma";

export type VehicleRecord = {
  id: string;
  shopId: string;
  customerId: string;
  plateNumber: string | null;
  vin: string | null;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  engineNumber: string | null;
  fuelType: string | null;
  transmission: string | null;
  engineDetails: string | null;
  currentOdometer: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
};

export type VehicleListItem = VehicleRecord & {
  customerName: string;
  customerPhone: string | null;
  serviceOrderCount: number;
  lastServiceAt: Date | null;
};

export type CreateVehicleInput = {
  customerId: string;
  plateNumber?: string | null;
  vin?: string | null;
  make: string;
  model: string;
  year?: number | null;
  color?: string | null;
  engineNumber?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  engineDetails?: string | null;
  currentOdometer?: number | null;
  notes?: string | null;
};

export type UpdateVehicleInput = CreateVehicleInput;

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeVin(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, "").toUpperCase();
  return normalized || null;
}

function normalizePlate(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function validateInput(input: CreateVehicleInput) {
  const make = input.make.trim();
  const model = input.model.trim();
  if (!input.customerId) throw new Error("يجب اختيار العميل صاحب المركبة.");
  if (!make) throw new Error("ماركة المركبة مطلوبة.");
  if (!model) throw new Error("موديل المركبة مطلوب.");

  if (input.year != null && (!Number.isInteger(input.year) || input.year < 1886 || input.year > 2200)) {
    throw new Error("سنة الصنع غير صالحة.");
  }
  if (input.currentOdometer != null && (!Number.isInteger(input.currentOdometer) || input.currentOdometer < 0)) {
    throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً موجباً أو صفراً.");
  }

  return {
    ...input,
    make,
    model,
    plateNumber: normalizePlate(input.plateNumber),
    vin: normalizeVin(input.vin),
    color: emptyToNull(input.color),
    engineNumber: emptyToNull(input.engineNumber),
    fuelType: emptyToNull(input.fuelType),
    transmission: emptyToNull(input.transmission),
    engineDetails: emptyToNull(input.engineDetails),
    notes: emptyToNull(input.notes),
  };
}

async function assertCustomerBelongsToShop(shopId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shopId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new Error("العميل غير موجود في هذا المركز.");
}

async function assertVehicleIdentityAvailable(
  shopId: string,
  plateNumber: string | null,
  vin: string | null,
  excludeId?: string,
) {
  if (!plateNumber && !vin) return;

  const rows = await prisma.$queryRaw<Array<{ id: string; plateNumber: string | null; vin: string | null }>>`
    SELECT "id", "plateNumber", "vin"
    FROM "Vehicle"
    WHERE "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND (${excludeId ?? null}::uuid IS NULL OR "id" <> ${excludeId ?? null}::uuid)
      AND (
        (${plateNumber}::text IS NOT NULL AND lower(btrim("plateNumber")) = lower(btrim(${plateNumber}::text)))
        OR
        (${vin}::text IS NOT NULL AND upper(btrim("vin")) = upper(btrim(${vin}::text)))
      )
    LIMIT 1
  `;

  if (rows[0]) {
    if (plateNumber && rows[0].plateNumber?.trim().toLowerCase() === plateNumber.trim().toLowerCase()) {
      throw new Error("يوجد مركبة مسجلة بنفس رقم اللوحة في هذا المركز.");
    }
    if (vin && rows[0].vin?.trim().toUpperCase() === vin.trim().toUpperCase()) {
      throw new Error("يوجد مركبة مسجلة بنفس رقم الهيكل VIN في هذا المركز.");
    }
    throw new Error("يوجد مركبة مسجلة مسبقاً بنفس بيانات التعريف.");
  }
}

export async function createVehicle(shopId: string, input: CreateVehicleInput): Promise<VehicleRecord> {
  const data = validateInput(input);
  await assertCustomerBelongsToShop(shopId, data.customerId);
  await assertVehicleIdentityAvailable(shopId, data.plateNumber, data.vin);

  const rows = await prisma.$queryRaw<VehicleRecord[]>`
    INSERT INTO "Vehicle" (
      "shopId", "customerId", "plateNumber", "vin", "make", "model", "year", "color",
      "engineNumber", "fuelType", "transmission", "engineDetails", "currentOdometer", "notes"
    ) VALUES (
      ${shopId}::uuid, ${data.customerId}::uuid, ${data.plateNumber}, ${data.vin}, ${data.make}, ${data.model},
      ${data.year ?? null}, ${data.color}, ${data.engineNumber}, ${data.fuelType}, ${data.transmission},
      ${data.engineDetails}, ${data.currentOdometer ?? null}, ${data.notes}
    )
    RETURNING *
  `;

  return rows[0];
}

export async function listVehicles(shopId: string, search?: string): Promise<VehicleListItem[]> {
  const term = search?.trim();
  const pattern = term ? `%${term}%` : null;

  const rows = await prisma.$queryRaw<Array<Omit<VehicleListItem, "serviceOrderCount"> & { serviceOrderCount: bigint }>>`
    SELECT
      v.*,
      c."name" AS "customerName",
      c."phone" AS "customerPhone",
      COUNT(so."id")::bigint AS "serviceOrderCount",
      MAX(so."receivedAt") AS "lastServiceAt"
    FROM "Vehicle" v
    JOIN "Customer" c ON c."id" = v."customerId" AND c."shopId" = v."shopId"
    LEFT JOIN "ServiceOrder" so
      ON so."vehicleId" = v."id"
      AND so."shopId" = v."shopId"
      AND so."deletedAt" IS NULL
    WHERE v."shopId" = ${shopId}::uuid
      AND v."deletedAt" IS NULL
      AND (
        ${pattern}::text IS NULL
        OR v."make" ILIKE ${pattern}::text
        OR v."model" ILIKE ${pattern}::text
        OR COALESCE(v."plateNumber", '') ILIKE ${pattern}::text
        OR COALESCE(v."vin", '') ILIKE ${pattern}::text
        OR c."name" ILIKE ${pattern}::text
        OR COALESCE(c."phone", '') ILIKE ${pattern}::text
      )
    GROUP BY v."id", c."name", c."phone"
    ORDER BY COALESCE(MAX(so."receivedAt"), v."updatedAt") DESC
    LIMIT 200
  `;

  return rows.map((row) => ({ ...row, serviceOrderCount: Number(row.serviceOrderCount) }));
}

export async function getVehicleById(shopId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: vehicleId,
      shopId,
      deletedAt: null,
      customer: { shopId },
    },
    include: {
      customer: {
        select: { name: true, phone: true, email: true },
      },
      serviceOrders: {
        where: { shopId, deletedAt: null },
        orderBy: { receivedAt: "desc" },
        take: 100,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          reportedIssue: true,
          diagnosis: true,
          odometerAtIntake: true,
          estimatedTotal: true,
          finalTotal: true,
          receivedAt: true,
          deliveredAt: true,
          closedAt: true,
        },
      },
    },
  });

  if (!vehicle) return null;

  const { customer, serviceOrders, ...record } = vehicle;
  return {
    ...record,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    serviceOrders: serviceOrders.map((order) => ({
      ...order,
      estimatedTotal: order.estimatedTotal == null ? null : Number(order.estimatedTotal),
      finalTotal: order.finalTotal == null ? null : Number(order.finalTotal),
    })),
  };
}

export async function updateVehicle(shopId: string, vehicleId: string, input: UpdateVehicleInput): Promise<VehicleRecord> {
  const data = validateInput(input);
  await assertCustomerBelongsToShop(shopId, data.customerId);

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Vehicle"
    WHERE "id" = ${vehicleId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `;
  if (!existing[0]) throw new Error("المركبة غير موجودة.");

  await assertVehicleIdentityAvailable(shopId, data.plateNumber, data.vin, vehicleId);

  const rows = await prisma.$queryRaw<VehicleRecord[]>`
    UPDATE "Vehicle"
    SET "customerId" = ${data.customerId}::uuid,
        "plateNumber" = ${data.plateNumber},
        "vin" = ${data.vin},
        "make" = ${data.make},
        "model" = ${data.model},
        "year" = ${data.year ?? null},
        "color" = ${data.color},
        "engineNumber" = ${data.engineNumber},
        "fuelType" = ${data.fuelType},
        "transmission" = ${data.transmission},
        "engineDetails" = ${data.engineDetails},
        "currentOdometer" = ${data.currentOdometer ?? null},
        "notes" = ${data.notes},
        "updatedAt" = now(),
        "version" = "version" + 1
    WHERE "id" = ${vehicleId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    RETURNING *
  `;

  return rows[0];
}

export async function softDeleteVehicle(shopId: string, vehicleId: string): Promise<void> {
  const activeOrders = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "ServiceOrder"
    WHERE "shopId" = ${shopId}::uuid
      AND "vehicleId" = ${vehicleId}::uuid
      AND "deletedAt" IS NULL
      AND "status" NOT IN ('CLOSED','CANCELLED','REJECTED')
  `;
  if (Number(activeOrders[0]?.count ?? 0) > 0) {
    throw new Error("لا يمكن حذف مركبة لديها أمر صيانة مفتوح.");
  }

  const changed = await prisma.$executeRaw`
    UPDATE "Vehicle"
    SET "deletedAt" = now(), "updatedAt" = now(), "version" = "version" + 1
    WHERE "id" = ${vehicleId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
  `;
  if (changed === 0) throw new Error("المركبة غير موجودة.");
}

export const vehicleService = {
  createVehicle,
  listVehicles,
  getVehicleById,
  updateVehicle,
  softDeleteVehicle,
};
