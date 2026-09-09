import {
  getOfflineCustomer,
  getOfflineMeta,
  hasPendingMutationForEntity,
  listPendingMutations,
  putOfflineCustomer,
  setOfflineMeta,
  updateOfflineMutation,
} from "./db";
import type { OfflineCustomer, OfflineMutation } from "./types";

const CUSTOMER_CURSOR_KEY = "sync:customer:cursor";

type ServerCustomer = Omit<OfflineCustomer, "syncStatus">;

type MutationResult = {
  operationId: string;
  status: "applied" | "conflict" | "failed";
  customer?: ServerCustomer;
  errorCode?: string;
  errorMessage?: string;
};

type PullChange = {
  sequence: string;
  action: "upsert" | "delete" | string;
  customer: ServerCustomer | null;
};

type SyncResponse = {
  ok: boolean;
  error?: string;
  results?: MutationResult[];
  pull?: {
    changes: PullChange[];
    nextCursor: string;
    hasMore: boolean;
  };
};

export type CustomerSyncSummary = {
  pushed: number;
  applied: number;
  conflicts: number;
  failed: number;
  pulled: number;
  cursor: string;
};

function toOfflineCustomer(customer: ServerCustomer, syncStatus: OfflineCustomer["syncStatus"]): OfflineCustomer {
  return { ...customer, syncStatus };
}

async function markNetworkFailure(mutations: OfflineMutation[], message: string) {
  await Promise.all(
    mutations.map((mutation) =>
      updateOfflineMutation(mutation.operationId, {
        status: "failed",
        retryCount: mutation.retryCount + 1,
        lastError: message,
      }),
    ),
  );
}

async function applyMutationResults(shopId: string, results: MutationResult[]) {
  let applied = 0;
  let conflicts = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "applied") {
      applied += 1;
      await updateOfflineMutation(result.operationId, {
        status: "applied",
        lastError: null,
        conflictSnapshot: null,
      });

      if (result.customer) {
        const stillPending = await hasPendingMutationForEntity(shopId, result.customer.id);
        if (!stillPending) {
          await putOfflineCustomer(toOfflineCustomer(result.customer, "synced"));
        }
      }
      continue;
    }

    const mutation = await import("./db").then(({ getOfflineMutation }) => getOfflineMutation(result.operationId));
    if (!mutation) continue;

    if (result.status === "conflict") {
      conflicts += 1;
      await updateOfflineMutation(result.operationId, {
        status: "conflict",
        lastError: result.errorMessage ?? "حدث تعارض أثناء المزامنة.",
        conflictSnapshot: result.customer ? toOfflineCustomer(result.customer, "synced") : null,
      });
      const local = await getOfflineCustomer(mutation.entityId);
      if (local) {
        await putOfflineCustomer({ ...local, syncStatus: "conflict" });
      }
      continue;
    }

    failed += 1;
    await updateOfflineMutation(result.operationId, {
      status: "failed",
      retryCount: mutation.retryCount + 1,
      lastError: result.errorMessage ?? "تعذر تطبيق عملية المزامنة.",
    });
  }

  return { applied, conflicts, failed };
}

async function applyPull(shopId: string, changes: PullChange[]) {
  let pulled = 0;

  for (const change of changes) {
    if (!change.customer || change.customer.shopId !== shopId) continue;

    const hasPending = await hasPendingMutationForEntity(shopId, change.customer.id);
    if (hasPending) continue;

    const local = await getOfflineCustomer(change.customer.id);
    if (!local || change.customer.version >= local.version) {
      await putOfflineCustomer(toOfflineCustomer(change.customer, "synced"));
      pulled += 1;
    }
  }

  return pulled;
}

async function syncBatch(shopId: string, mutations: OfflineMutation[], cursor: string) {
  mutations.forEach((mutation) => {
    if (mutation.shopId !== shopId) {
      throw new Error("Outbox mutation belongs to another shop.");
    }
  });

  await Promise.all(
    mutations.map((mutation) =>
      updateOfflineMutation(mutation.operationId, { status: "syncing", lastError: null }),
    ),
  );

  let response: Response;
  try {
    response = await fetch("/api/sync/v1/customers", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor, mutations }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر الاتصال بالسيرفر.";
    await markNetworkFailure(mutations, message);
    throw error;
  }

  const data = (await response.json()) as SyncResponse;
  if (!response.ok || !data.ok || !data.pull) {
    const message = data.error ?? "تعذر تنفيذ المزامنة.";
    await markNetworkFailure(mutations, message);
    throw new Error(message);
  }

  const resultCounts = await applyMutationResults(shopId, data.results ?? []);
  const pulled = await applyPull(shopId, data.pull.changes);
  await setOfflineMeta({ key: CUSTOMER_CURSOR_KEY, value: data.pull.nextCursor });

  return {
    ...resultCounts,
    pulled,
    cursor: data.pull.nextCursor,
    hasMore: data.pull.hasMore,
  };
}

export async function syncCustomersNow(shopId: string): Promise<CustomerSyncSummary> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("لا يوجد اتصال بالإنترنت حالياً.");
  }

  let cursor = (await getOfflineMeta(CUSTOMER_CURSOR_KEY)) ?? "0";
  let pushed = 0;
  let applied = 0;
  let conflicts = 0;
  let failed = 0;
  let pulled = 0;

  const pending = (await listPendingMutations(shopId)).filter((mutation) => mutation.retryCount < 5);

  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = pending.slice(offset, offset + 100);
    const result = await syncBatch(shopId, batch, cursor);
    pushed += batch.length;
    applied += result.applied;
    conflicts += result.conflicts;
    failed += result.failed;
    pulled += result.pulled;
    cursor = result.cursor;

    while (result.hasMore) {
      const pullOnly = await syncBatch(shopId, [], cursor);
      pulled += pullOnly.pulled;
      cursor = pullOnly.cursor;
      if (!pullOnly.hasMore) break;
    }
  }

  if (pending.length === 0) {
    let result = await syncBatch(shopId, [], cursor);
    pulled += result.pulled;
    cursor = result.cursor;
    while (result.hasMore) {
      result = await syncBatch(shopId, [], cursor);
      pulled += result.pulled;
      cursor = result.cursor;
    }
  }

  return { pushed, applied, conflicts, failed, pulled, cursor };
}
