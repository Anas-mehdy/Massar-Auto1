import { createOfflineOperationId, getOrCreateDeviceId } from "./device";
import {
  enqueueOfflineMutation,
  getOfflineCustomer,
  listEntityMutations,
  putOfflineCustomer,
  updateOfflineMutation,
} from "./db";
import type { OfflineActor } from "./customerRepository";
import type { CustomerMutationPayload, OfflineMutation } from "./types";

async function customerConflicts(shopId: string, customerId: string) {
  const mutations = await listEntityMutations(shopId, customerId);
  return mutations.filter((mutation) => mutation.status === "conflict");
}

async function discardConflicts(conflicts: OfflineMutation[]) {
  await Promise.all(
    conflicts.map((mutation) => updateOfflineMutation(mutation.operationId, {
      status: "discarded",
      lastError: null,
    })),
  );
}

export async function acceptServerCustomer(shopId: string, customerId: string) {
  const conflicts = await customerConflicts(shopId, customerId);
  const latest = conflicts.at(-1) ?? null;
  if (!latest?.conflictSnapshot) {
    throw new Error("لا توجد نسخة سيرفر محفوظة لهذا التعارض.");
  }

  await discardConflicts(conflicts);
  await putOfflineCustomer({ ...latest.conflictSnapshot, syncStatus: "synced" });
  return latest.conflictSnapshot;
}

export async function reapplyLocalCustomer(actor: OfflineActor, customerId: string) {
  const [local, conflicts] = await Promise.all([
    getOfflineCustomer(customerId),
    customerConflicts(actor.shopId, customerId),
  ]);
  const latest = conflicts.at(-1) ?? null;

  if (!local || local.shopId !== actor.shopId) {
    throw new Error("النسخة المحلية للعميل غير موجودة.");
  }
  if (!latest?.conflictSnapshot) {
    throw new Error("لا توجد نسخة سيرفر محفوظة لهذا التعارض.");
  }
  if (latest.conflictSnapshot.deletedAt) {
    throw new Error("تم حذف العميل على السيرفر، لذلك لا يمكن إعادة تطبيق التعديل المحلي تلقائياً.");
  }

  await discardConflicts(conflicts);

  const payload: CustomerMutationPayload = {
    name: local.name,
    phone: local.phone,
    phoneNormalized: local.phoneNormalized,
    email: local.email,
    notes: local.notes,
  };

  const mutation: OfflineMutation<CustomerMutationPayload> = {
    operationId: createOfflineOperationId(),
    deviceId: getOrCreateDeviceId(),
    shopId: actor.shopId,
    userId: actor.userId,
    entityType: "customer",
    entityId: local.id,
    mutationType: "customer.update",
    baseVersion: latest.conflictSnapshot.version,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    lastError: null,
  };

  const optimistic = {
    ...local,
    version: latest.conflictSnapshot.version + 1,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    syncStatus: "pending" as const,
  };

  await putOfflineCustomer(optimistic);
  await enqueueOfflineMutation(mutation);
  return optimistic;
}
