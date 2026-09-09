const DEVICE_ID_KEY = "massar.offline.deviceId";

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") {
    throw new Error("Device identity is only available in the client runtime.");
  }

  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = newId();
  window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function createOfflineOperationId() {
  return newId();
}
