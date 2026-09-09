import type { OfflineCustomer, OfflineMetaRecord, OfflineMutation } from "./types";

const DB_NAME = "massar-offline";
const DB_VERSION = 1;

export const OFFLINE_STORES = {
  customers: "customers",
  outbox: "outbox",
  meta: "meta",
} as const;

function ensureIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not available in this runtime.");
  }
}

export function openOfflineDb(): Promise<IDBDatabase> {
  ensureIndexedDb();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(OFFLINE_STORES.customers)) {
        const customers = db.createObjectStore(OFFLINE_STORES.customers, { keyPath: "id" });
        customers.createIndex("shopId", "shopId", { unique: false });
        customers.createIndex("shopUpdatedAt", ["shopId", "updatedAt"], { unique: false });
        customers.createIndex("shopPhoneNormalized", ["shopId", "phoneNormalized"], { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.outbox)) {
        const outbox = db.createObjectStore(OFFLINE_STORES.outbox, { keyPath: "operationId" });
        outbox.createIndex("shopStatusCreatedAt", ["shopId", "status", "createdAt"], { unique: false });
        outbox.createIndex("entityId", "entityId", { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.meta)) {
        db.createObjectStore(OFFLINE_STORES.meta, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open Massar offline database."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export async function putOfflineCustomer(customer: OfflineCustomer) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.customers, "readwrite");
  await requestResult(tx.objectStore(OFFLINE_STORES.customers).put(customer));
  db.close();
}

export async function getOfflineCustomer(id: string) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.customers, "readonly");
  const result = await requestResult<OfflineCustomer | undefined>(
    tx.objectStore(OFFLINE_STORES.customers).get(id),
  );
  db.close();
  return result;
}

export async function listOfflineCustomers(shopId: string) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.customers, "readonly");
  const index = tx.objectStore(OFFLINE_STORES.customers).index("shopId");
  const customers = await requestResult<OfflineCustomer[]>(index.getAll(shopId));
  db.close();
  return customers
    .filter((customer) => !customer.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function enqueueOfflineMutation(mutation: OfflineMutation) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.outbox, "readwrite");
  await requestResult(tx.objectStore(OFFLINE_STORES.outbox).put(mutation));
  db.close();
}

export async function listPendingMutations(shopId: string) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.outbox, "readonly");
  const all = await requestResult<OfflineMutation[]>(tx.objectStore(OFFLINE_STORES.outbox).getAll());
  db.close();
  return all
    .filter((mutation) => mutation.shopId === shopId && (mutation.status === "pending" || mutation.status === "failed"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function setOfflineMeta(record: OfflineMetaRecord) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.meta, "readwrite");
  await requestResult(tx.objectStore(OFFLINE_STORES.meta).put(record));
  db.close();
}

export async function getOfflineMeta(key: string) {
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_STORES.meta, "readonly");
  const result = await requestResult<OfflineMetaRecord | undefined>(tx.objectStore(OFFLINE_STORES.meta).get(key));
  db.close();
  return result?.value ?? null;
}
