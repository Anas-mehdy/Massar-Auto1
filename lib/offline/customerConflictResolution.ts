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

async function latestCustomerConflict(shopId: string, customerId: string) {
  const mutations = await listEntityMutations(shopId, customerId);
  return [...mutations].reverse().find((mutation) => mutation.status === "conflict") ?? null;
}

export async function acceptServerCustomer(shopId: string, customerId: string) {
  const conflict = await latestCustomerConflict(shopId, customerId);
  if (!conflict?.conflictSnapshot) {
    throw new Error("لا توجد نسخة سيرفر محفوظة لهذا التعارض.");
  }

  const mutations = await listEntityMutations(shopId, customerId);
  await Promise.all(
    mutations
      .filter((mutation) => mutation.status === "conflict")
      .map((mutation) => updateOfflineMutation(mutation.operationId, {
        status: "discarded",
        lastError: null,
      })),
  );

  await putOfflineCustomer({ ...conflict.conflictSnapshot, syncStatus: "synced" });
  return conflict.conflictSnapshot;
}

export async function reapplyLocalCustomer(actor: OfflineActor, customerId: string) {
  const [local, conflict] = await Promise.all([
    getOfflineCustomer(customerId),
    latestCustomerConflict(actor.shopId, customerId),
  ]);

  if (!local || local.shopId !== actor.shopId) {
    throw new Error("النسخة المحلية للعميل غير موجودة.");
  }
  if (!conflict?.conflictSnapshot) {
    throw new Error("لا توجد نسخة سيرفر محفوظة لهذا التعارض.");
  }
  if (conflict.conflictSnapshot.deletedAt) {
    throw new Error("تم حذف العميل على السيرفر، لذلك لا يمكن إعادة تطبيق التعديل المحلي تلقائياً.");
  }

  await updateOfflineMutation(conflict.operationId, {
    status: "discarded",
    lastError: null,
  });

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
    baseVersion: conflict.conflictSnapshot.version,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    lastError: null,
  };

  const optimistic = {
    ...local,
    version: conflict.conflictSnapshot.version + 1,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    syncStatus: "pending" as const,
  };

  await putOfflineCustomer(optimistic);
  await enqueueOfflineMutation(mutation);
  return optimistic;
}
