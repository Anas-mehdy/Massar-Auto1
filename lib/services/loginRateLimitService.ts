import { prisma } from "@/lib/prisma";
import { hmacAuthValue } from "@/lib/auth/security";

const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_PAIR_FAILURES = 6;
const MAX_FINGERPRINT_FAILURES = 30;
const RATE_LIMIT_MESSAGE = "محاولات تسجيل دخول كثيرة. انتظر 15 دقيقة ثم حاول مجدداً.";

function emailHash(email: string) {
  return hmacAuthValue(`login-email:${email.toLowerCase().trim()}`);
}

async function getFailureCounts(email: string, requestFingerprint: string) {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  const hash = emailHash(email);
  const rows = await prisma.$queryRaw<Array<{ pairCount: number; fingerprintCount: number }>>`
    SELECT
      COUNT(*) FILTER (WHERE "emailHash" = ${hash})::int AS "pairCount",
      COUNT(*)::int AS "fingerprintCount"
    FROM "AuthLoginAttempt"
    WHERE "requestFingerprint" = ${requestFingerprint}
      AND "createdAt" >= ${cutoff}
  `;

  return rows[0] ?? { pairCount: 0, fingerprintCount: 0 };
}

export async function assertLoginAllowed(email: string, requestFingerprint: string) {
  const counts = await getFailureCounts(email, requestFingerprint);
  if (counts.pairCount >= MAX_PAIR_FAILURES || counts.fingerprintCount >= MAX_FINGERPRINT_FAILURES) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
}

export async function recordLoginFailure(email: string, requestFingerprint: string) {
  const hash = emailHash(email);
  const retentionCutoff = new Date(Date.now() - RETENTION_MS);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "AuthLoginAttempt" ("id", "emailHash", "requestFingerprint", "createdAt")
      VALUES (gen_random_uuid(), ${hash}, ${requestFingerprint}, now())
    `;
    await tx.$executeRaw`
      DELETE FROM "AuthLoginAttempt"
      WHERE "createdAt" < ${retentionCutoff}
    `;
  });
}

export async function clearLoginFailures(email: string, requestFingerprint: string) {
  const hash = emailHash(email);
  await prisma.$executeRaw`
    DELETE FROM "AuthLoginAttempt"
    WHERE "emailHash" = ${hash}
      AND "requestFingerprint" = ${requestFingerprint}
  `;
}

export const loginRateLimitService = {
  assertAllowed: assertLoginAllowed,
  recordFailure: recordLoginFailure,
  clearFailures: clearLoginFailures,
};
