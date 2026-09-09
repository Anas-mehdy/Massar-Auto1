import { normalizePhone } from "@/lib/services/customerService";
import { createOfflineOperationId, getOrCreateDeviceId } from "./device";
import {
  enqueueOfflineMutation,
  getOfflineCustomer,
  listOfflineCustomers,
  putOfflineCustomer,
} from "./db";
import type { CustomerMutationPayload, OfflineCustomer, OfflineMutation } from "./types";

export type OfflineActor = {
  shopId: string;
  userId: string;
};

export type OfflineCustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function queueCustomerMutation(
  actor: OfflineActor,
  customer: OfflineCustomer,
  mutationType: OfflineMutation["mutationType"],
  payload: CustomerMutationPayload,
  baseVersion: number | null,
) {
  await enqueueOfflineMutation({
    operationId: createOfflineOperationId(),
    deviceId: getOrCreateDeviceId(),
    shopId: actor.shopId,
    userId: actor.userId,
    entityType: "customer",
    entityId: customer.id,
    mutationType,
    baseVersion,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    lastError: null,
  });
}

export async function createCustomerOffline(actor: OfflineActor, input: OfflineCustomerInput) {
  const name = input.name.trim();
  if (!name) throw new Error("اسم العميل مطلوب.");

  const now = new Date().toISOString();
  const id = createOfflineOperationId();
  const phone = clean(input.phone);
  const customer: OfflineCustomer = {
    id,
    shopId: actor.shopId,
    clientGeneratedId: id,
    name,
    phone,
    phoneNormalized: normalizePhone(phone),
    email: clean(input.email),
    notes: clean(input.notes),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    // A newly created server customer starts at version 1. Keeping the optimistic
    // local version aligned lets subsequent offline edits queue against version 1.
    version: 1,
    syncStatus: "pending",
  };

  await putOfflineCustomer(customer);
  await queueCustomerMutation(actor, customer, "customer.create", {
    clientGeneratedId: customer.clientGeneratedId,
    name: customer.name,
    phone: customer.phone,
    phoneNormalized: customer.phoneNormalized,
    email: customer.email,
    notes: customer.notes,
  }, null);

  return customer;
}

export async function updateCustomerOffline(
  actor: OfflineActor,
  customerId: string,
  input: OfflineCustomerInput,
) {
  const existing = await getOfflineCustomer(customerId);
  if (!existing || existing.shopId !== actor.shopId || existing.deletedAt) {
    throw new Error("العميل غير موجود على هذا الجهاز.");
  }

  const name = input.name.trim();
  if (!name) throw new Error("اسم العميل مطلوب.");
  const phone = clean(input.phone);
  const updated: OfflineCustomer = {
    ...existing,
    name,
    phone,
    phoneNormalized: normalizePhone(phone),
    email: clean(input.email),
    notes: clean(input.notes),
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
    syncStatus: "pending",
  };

  await putOfflineCustomer(updated);
  await queueCustomerMutation(actor, updated, "customer.update", {
    name: updated.name,
    phone: updated.phone,
    phoneNormalized: updated.phoneNormalized,
    email: updated.email,
    notes: updated.notes,
  }, existing.version);

  return updated;
}

export async function deleteCustomerOffline(actor: OfflineActor, customerId: string) {
  const existing = await getOfflineCustomer(customerId);
  if (!existing || existing.shopId !== actor.shopId || existing.deletedAt) {
    throw new Error("العميل غير موجود على هذا الجهاز.");
  }

  const deletedAt = new Date().toISOString();
  const updated: OfflineCustomer = {
    ...existing,
    deletedAt,
    updatedAt: deletedAt,
    version: existing.version + 1,
    syncStatus: "pending",
  };

  await putOfflineCustomer(updated);
  await queueCustomerMutation(actor, updated, "customer.delete", { deletedAt }, existing.version);
  return updated;
}

export async function getCustomersOffline(shopId: string) {
  return listOfflineCustomers(shopId);
}
