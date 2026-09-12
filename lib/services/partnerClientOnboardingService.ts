import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { requirePartnerSession } from "@/lib/partner-auth";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { COUNTRY_DIAL_CODES, validatePhoneForCountry } from "@/lib/countries";
import { prisma } from "@/lib/prisma";
import { registrationRateLimitService } from "@/lib/services/registrationRateLimitService";

const TRIAL_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
const INVITE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("البريد الإلكتروني غير صالح.");
  return email;
}
function normalizeName(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 160) throw new Error("الاسم يجب أن يكون بين حرفين و160 حرفاً.");
  return name;
}
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

async function assertActivePartnerById(partnerId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; code: string; name: string }>>`
    SELECT "id", "code", "name" FROM "Partner"
    WHERE "id" = ${partnerId}::uuid AND "status" = 'ACTIVE'::"PartnerStatus" AND "deletedAt" IS NULL LIMIT 1
  `;
  if (!rows[0]) throw new Error("الوكيل غير موجود أو موقوف.");
  return rows[0];
}

export async function createPartnerClientInvitation(input: { clientName: string; email: string }) {
  const session = await requirePartnerSession();
  await assertActivePartnerById(session.partnerId);
  const clientName = normalizeName(input.clientName);
  const email = normalizeEmail(input.email);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error("هذا البريد لديه حساب مسار بالفعل.");

  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_DURATION_MS);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "PartnerClientInvitation"
        SET "status" = 'EXPIRED', "updatedAt" = NOW()
        WHERE "partnerId" = ${session.partnerId}::uuid
          AND lower("email") = ${email}
          AND "status" = 'PENDING'
          AND "expiresAt" <= NOW()
      `;
      await tx.$executeRaw`
        INSERT INTO "PartnerClientInvitation" (
          "id", "partnerId", "clientName", "email", "tokenHash", "status", "expiresAt", "createdAt", "updatedAt"
        ) VALUES (${id}::uuid, ${session.partnerId}::uuid, ${clientName}, ${email}, ${hash}, 'PENDING', ${expiresAt}, NOW(), NOW())
      `;
    });
  } catch {
    throw new Error("يوجد بالفعل رابط دعوة فعال لهذا البريد.");
  }
  return { token: rawToken, expiresAt };
}

export async function listPartnerClientInvitations() {
  const session = await requirePartnerSession();
  await prisma.$executeRaw`
    UPDATE "PartnerClientInvitation" SET "status"='EXPIRED', "updatedAt"=NOW()
    WHERE "partnerId"=${session.partnerId}::uuid AND "status"='PENDING' AND "expiresAt" <= NOW()
  `;
  return prisma.$queryRaw<Array<{ id: string; clientName: string; email: string; status: string; expiresAt: Date; usedAt: Date | null; createdAt: Date }>>`
    SELECT "id", "clientName", "email", "status", "expiresAt", "usedAt", "createdAt"
    FROM "PartnerClientInvitation" WHERE "partnerId" = ${session.partnerId}::uuid
    ORDER BY "createdAt" DESC LIMIT 100
  `;
}

export async function getInvitationPreview(token: string) {
  const hash = tokenHash(token);
  const rows = await prisma.$queryRaw<Array<{ partnerId: string; partnerName: string; partnerCode: string; clientName: string; email: string; expiresAt: Date; status: string }>>`
    SELECT i."partnerId", p."name" AS "partnerName", p."code" AS "partnerCode", i."clientName", i."email", i."expiresAt", i."status"
    FROM "PartnerClientInvitation" i JOIN "Partner" p ON p."id" = i."partnerId"
    WHERE i."tokenHash" = ${hash} AND p."status" = 'ACTIVE'::"PartnerStatus" AND p."deletedAt" IS NULL LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.status !== "PENDING" || row.expiresAt <= new Date()) return null;
  return row;
}

export async function getPublicPartnerPreview(code: string) {
  const normalized = code.trim().toUpperCase();
  const rows = await prisma.$queryRaw<Array<{ partnerId: string; partnerName: string; partnerCode: string }>>`
    SELECT "id" AS "partnerId", "name" AS "partnerName", "code" AS "partnerCode" FROM "Partner"
    WHERE upper("code") = ${normalized} AND "status" = 'ACTIVE'::"PartnerStatus" AND "deletedAt" IS NULL LIMIT 1
  `;
  return rows[0] ?? null;
}

export type PartnerClientRegistrationInput = { ownerName: string; email: string; password: string; shopName: string; phone: string; countryCode: string; currency: string; address?: string };
function validateRegistration(input: PartnerClientRegistrationInput) {
  const ownerName = normalizeName(input.ownerName);
  const email = normalizeEmail(input.email);
  if (input.password.length < 8 || input.password.length > 128) throw new Error("كلمة المرور يجب أن تكون بين 8 و128 حرفاً.");
  const shopName = normalizeName(input.shopName);
  const countryCode = input.countryCode.trim().toUpperCase();
  const country = COUNTRY_DIAL_CODES.find((c) => c.code === countryCode);
  if (!country) throw new Error("الدولة المختارة غير مدعومة.");
  const phoneValidation = validatePhoneForCountry(countryCode, input.phone);
  if (!phoneValidation.isValid) throw new Error(phoneValidation.error || "رقم الهاتف غير صحيح.");
  return { ownerName, email, shopName, countryCode, phone: phoneValidation.formattedInternational, currency: input.currency.trim() || country.currency, address: input.address?.trim() || null };
}

async function createPartnerManagedShop(partnerId: string, input: PartnerClientRegistrationInput, requestFingerprint: string) {
  const v = validateRegistration(input);
  await registrationRateLimitService.consumeAttempt(v.email, requestFingerprint);
  const passwordHash = await hashPassword(input.password);
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DURATION_MS);
  const result = await prisma.$transaction(async (tx) => {
    const partnerRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Partner" WHERE "id"=${partnerId}::uuid AND "status"='ACTIVE'::"PartnerStatus" AND "deletedAt" IS NULL FOR SHARE
    `;
    if (!partnerRows[0]) throw new Error("الوكيل غير موجود أو موقوف.");
    const existingUser = await tx.user.findUnique({ where: { email: v.email } });
    if (existingUser) throw new Error("هذا البريد الإلكتروني مسجل بالفعل.");
    const shop = await tx.shop.create({ data: { name: v.shopName, phone: v.phone, countryCode: v.countryCode, currency: v.currency, address: v.address, taxRate: 15, subscription: { create: { plan: SubscriptionPlan.PROFESSIONAL, status: SubscriptionStatus.TRIALING, trialStartedAt, trialEndsAt } } } });
    await tx.$executeRaw`UPDATE "Shop" SET "partnerId"=${partnerId}::uuid, "partnerAssignedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=${shop.id}::uuid`;
    const user = await tx.user.create({ data: { shopId: shop.id, email: v.email, name: v.ownerName, passwordHash, role: "OWNER" } });
    return { shop, user };
  });
  await setSessionCookie({ userId: result.user.id, shopId: result.shop.id, email: result.user.email, name: result.user.name, role: result.user.role, shopName: result.shop.name, currency: result.shop.currency, sessionVersion: result.user.version });
  return result;
}

export async function registerFromPartnerInvitation(token: string, input: PartnerClientRegistrationInput, requestFingerprint: string) {
  const hash = tokenHash(token);
  const v = validateRegistration(input);
  await registrationRateLimitService.consumeAttempt(v.email, requestFingerprint);
  const passwordHash = await hashPassword(input.password);
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DURATION_MS);
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; partnerId: string; email: string; expiresAt: Date; status: string }>>`
      SELECT "id", "partnerId", "email", "expiresAt", "status" FROM "PartnerClientInvitation" WHERE "tokenHash"=${hash} FOR UPDATE
    `;
    const invite = rows[0];
    if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date()) throw new Error("رابط الدعوة غير صالح أو منتهي.");
    if (v.email !== invite.email) throw new Error("البريد الإلكتروني لا يطابق الدعوة.");
    const partnerRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Partner" WHERE "id"=${invite.partnerId}::uuid AND "status"='ACTIVE'::"PartnerStatus" AND "deletedAt" IS NULL FOR SHARE
    `;
    if (!partnerRows[0]) throw new Error("الوكيل غير متاح حالياً.");
    const existingUser = await tx.user.findUnique({ where: { email: v.email } });
    if (existingUser) throw new Error("هذا البريد الإلكتروني مسجل بالفعل.");
    const shop = await tx.shop.create({ data: { name: v.shopName, phone: v.phone, countryCode: v.countryCode, currency: v.currency, address: v.address, taxRate: 15, subscription: { create: { plan: SubscriptionPlan.PROFESSIONAL, status: SubscriptionStatus.TRIALING, trialStartedAt, trialEndsAt } } } });
    await tx.$executeRaw`UPDATE "Shop" SET "partnerId"=${invite.partnerId}::uuid, "partnerAssignedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=${shop.id}::uuid`;
    const user = await tx.user.create({ data: { shopId: shop.id, email: v.email, name: v.ownerName, passwordHash, role: "OWNER" } });
    await tx.$executeRaw`UPDATE "PartnerClientInvitation" SET "status"='USED', "usedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=${invite.id}::uuid`;
    return { shop, user };
  });
  await setSessionCookie({ userId: result.user.id, shopId: result.shop.id, email: result.user.email, name: result.user.name, role: result.user.role, shopName: result.shop.name, currency: result.shop.currency, sessionVersion: result.user.version });
  return result;
}

export async function registerFromPartnerPublicLink(code: string, input: PartnerClientRegistrationInput, requestFingerprint: string) {
  const partner = await getPublicPartnerPreview(code);
  if (!partner) throw new Error("رابط الوكيل غير صالح أو غير متاح.");
  return createPartnerManagedShop(partner.partnerId, input, requestFingerprint);
}
