import { getOfflineMeta, setOfflineMeta } from "./db";

const OFFLINE_SESSION_KEY = "auth:offline-session";
const OFFLINE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type OfflineSessionSnapshot = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  shop: {
    id: string;
    name: string;
    currency: string;
    countryCode?: string | null;
  };
  membership: {
    id: string;
    role: string;
    status: string;
  };
  permissions: string[];
  issuedAt: string;
  expiresAt: string;
};

export async function saveOfflineSession(snapshot: OfflineSessionSnapshot) {
  await setOfflineMeta({ key: OFFLINE_SESSION_KEY, value: JSON.stringify(snapshot) });
}

export async function clearOfflineSession() {
  await setOfflineMeta({ key: OFFLINE_SESSION_KEY, value: "" });
}

export async function readOfflineSession() {
  const raw = await getOfflineMeta(OFFLINE_SESSION_KEY);
  if (!raw) return null;

  try {
    const snapshot = JSON.parse(raw) as OfflineSessionSnapshot;
    if (!snapshot?.user?.id || !snapshot?.shop?.id || !snapshot.expiresAt) return null;
    if (new Date(snapshot.expiresAt).getTime() <= Date.now()) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export async function refreshOfflineSessionSnapshot() {
  const response = await fetch("/api/sync/v1/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await response.json()) as { ok: boolean; session?: OfflineSessionSnapshot; error?: string };
  if (!response.ok || !body.ok || !body.session) {
    throw new Error(body.error ?? "تعذر تحديث جلسة العمل المحلية.");
  }
  await saveOfflineSession(body.session);
  return body.session;
}

export function createOfflineSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + OFFLINE_SESSION_MAX_AGE_MS);
}
