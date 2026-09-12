import { prisma } from "@/lib/prisma";
import { hmacAuthValue } from "@/lib/auth/security";

const WINDOW_MS = 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_PAIR_ATTEMPTS = 5;
const MAX_FINGERPRINT_ATTEMPTS = 10;
const RATE_LIMIT_MESSAGE = "محاولات إنشاء حساب كثيرة من هذا الجهاز. انتظر ساعة ثم حاول مجدداً.";

function emailHash(email: string) {
  return hmacAuthValue(`registration-email:${email.toLowerCase().trim()}`);
}

export async function consumeRegistrationAttempt(email: string, requestFingerprint: string) {
  const hash = emailHash(email);
  const cutoff = new Date(Date.now() - WINDOW_MS);
  const retentionCutoff = new Date(Date.now() - RETENTION_MS);

  await prisma.$transaction(async (tx) => {
    // Serialize registration attempts from the same fingerprint so concurrent
    // requests cannot race past the hourly cap.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${requestFingerprint}, 0))
    `;

    const rows = await tx.$queryRaw<Array<{ pairCount: number; fingerprintCount: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE "emailHash" = ${hash})::int AS "pairCount",
        COUNT(*)::int AS "fingerprintCount"
      FROM "AuthRegistrationAttempt"
      WHERE "requestFingerprint" = ${requestFingerprint}
        AND "createdAt" >= ${cutoff}
    `;
    const counts = rows[0] ?? { pairCount: 0, fingerprintCount: 0 };

    if (counts.pairCount >= MAX_PAIR_ATTEMPTS || counts.fingerprintCount >= MAX_FINGERPRINT_ATTEMPTS) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }

    await tx.$executeRaw`
      INSERT INTO "AuthRegistrationAttempt" ("id", "emailHash", "requestFingerprint", "createdAt")
      VALUES (gen_random_uuid(), ${hash}, ${requestFingerprint}, now())
    `;

    await tx.$executeRaw`
      DELETE FROM "AuthRegistrationAttempt"
      WHERE "createdAt" < ${retentionCutoff}
    `;
  });
}

export const registrationRateLimitService = {
  consumeAttempt: consumeRegistrationAttempt,
};
