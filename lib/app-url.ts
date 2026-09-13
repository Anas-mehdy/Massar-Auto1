function ensureProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
const vercelAppUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
  process.env.VERCEL_URL?.trim();

export const APP_URL = (
  configuredAppUrl ||
  (vercelAppUrl ? ensureProtocol(vercelAppUrl) : "http://localhost:3000")
).replace(/\/+$/, "");

export function buildAppUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${normalizedPath}`;
}
