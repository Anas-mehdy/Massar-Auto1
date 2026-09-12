import { headers } from "next/headers";
import { hmacAuthValue } from "@/lib/auth/security";

export async function getRequestFingerprint() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const userAgent = requestHeaders.get("user-agent")?.trim() || "unknown";

  return hmacAuthValue(`request-fingerprint:${ip}|${userAgent}`);
}
