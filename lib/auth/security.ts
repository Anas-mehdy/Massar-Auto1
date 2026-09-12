import { createHmac } from "node:crypto";

const DEV_AUTH_SECRET = "massar-auto-local-dev-session-secret-2026-only";

export function getAuthSecuritySecret() {
  const configuredSecret = process.env.AUTH_SECRET?.trim();

  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters long.");
    }
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }

  return DEV_AUTH_SECRET;
}

export function getAuthJwtSecret() {
  return new TextEncoder().encode(getAuthSecuritySecret());
}

export function hmacAuthValue(value: string) {
  return createHmac("sha256", getAuthSecuritySecret()).update(value).digest("hex");
}
