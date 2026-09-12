import { headers } from "next/headers";
import { hmacAuthValue } from "@/lib/auth/security";

async function readRequestIdentity() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const userAgent = requestHeaders.get("user-agent")?.trim() || "unknown";
  return { ip, userAgent };
}

export async function getRequestFingerprint() {
  const { ip, userAgent } = await readRequestIdentity();
  return hmacAuthValue(`request-fingerprint:${ip}|${userAgent}`);
}

/**
 * Stable per-network HMAC used for public signup abuse controls.
 * Unlike the login/device fingerprint, a caller cannot evade this simply by
 * rotating the User-Agent while remaining on the same source IP.
 */
export async function getRequestNetworkFingerprint() {
  const { ip, userAgent } = await readRequestIdentity();
  return ip !== "unknown"
    ? hmacAuthValue(`request-network:${ip}`)
    : hmacAuthValue(`request-network-fallback:${userAgent}`);
}
