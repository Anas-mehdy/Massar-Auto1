export type OfflineEntityType = "customer";

export type OfflineMutationType =
  | "customer.create"
  | "customer.update"
  | "customer.delete";

export type OfflineMutationStatus =
  | "pending"
  | "syncing"
  | "applied"
  | "conflict"
  | "failed";

export type OfflineCustomer = {
  id: string;
  shopId: string;
  clientGeneratedId: string | null;
  name: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  syncStatus: "synced" | "pending" | "conflict";
};

export type OfflineMutation<TPayload = unknown> = {
  operationId: string;
  deviceId: string;
  shopId: string;
  userId: string;
  entityType: OfflineEntityType;
  entityId: string;
  mutationType: OfflineMutationType;
  baseVersion: number | null;
  payload: TPayload;
  createdAt: string;
  status: OfflineMutationStatus;
  retryCount: number;
  lastError: string | null;
};

export type OfflineMetaRecord = {
  key: string;
  value: string;
};

export type CustomerMutationPayload = {
  clientGeneratedId?: string | null;
  name?: string;
  phone?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
  notes?: string | null;
  deletedAt?: string | null;
};
