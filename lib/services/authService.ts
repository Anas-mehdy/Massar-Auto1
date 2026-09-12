import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie, getSession } from "@/lib/auth";
import { COUNTRY_DIAL_CODES } from "@/lib/countries";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/server";
import { CURRENT_ONBOARDING_FLOW_VERSION } from "@/lib/onboarding/jobs";
import { loginRateLimitService } from "@/lib/services/loginRateLimitService";
import { registrationRateLimitService } from "@/lib/services/registrationRateLimitService";
import { z } from "zod";

const TRIAL_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
const supportedCountryCodes = new Set(COUNTRY_DIAL_CODES.map((country) => country.code));

export const registerSchema = z.object({
  name: z.string().min(2, "الاسم الكامل مطلوب ويجب ألا يقل عن حرفين"),
  email: z.string().email("البريد الإلكتروني غير صحيح ومطلوب"),
  password: z.string().min(8, "كلمة المرور مطلوبة ويجب ألا تقل عن 8 أحرف").max(128, "كلمة المرور طويلة جداً"),
  shopName: z.string().min(2, "اسم المتجر مطلوب ويجب ألا يقل عن حرفين"),
  phone: z.string().min(6, "رقم هاتف المتجر مطلوب لإنشاء الحساب"),
  countryCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => supportedCountryCodes.has(value), "الدولة المختارة غير مدعومة"),
  currency: z.string().min(1, "العملة الرسمية مطلوبة").default("SAR"),
  address: z.string().optional().default(""),
});

export const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(1, "يرجى إدخال كلمة المرور").max(128, "كلمة المرور طويلة جداً"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const authService = {
  async registerShop(input: RegisterInput, requestFingerprint: string) {
    const validated = registerSchema.parse(input);
    const normalizedEmail = validated.email.toLowerCase().trim();

    await registrationRateLimitService.consumeAttempt(normalizedEmail, requestFingerprint);

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new Error("هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول أو استخدام بريد آخر.");
    }

    const passwordHash = await hashPassword(validated.password);
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DURATION_MS);

    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: validated.shopName.trim(),
          phone: validated.phone?.trim() || null,
          countryCode: validated.countryCode,
          currency: validated.currency.trim() || "SAR",
          address: validated.address?.trim() || null,
          taxRate: 15,
          subscription: {
            create: {
              plan: "PROFESSIONAL",
              status: "TRIALING",
              trialStartedAt,
              trialEndsAt,
            },
          },
          onboardingProfile: {
            create: {
              flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
            },
          },
        },
      });

      const user = await tx.user.create({
        data: {
          shopId: shop.id,
          email: normalizedEmail,
          name: validated.name.trim(),
          passwordHash,
          role: "OWNER",
        },
      });

      await tx.$executeRaw`
        UPDATE "User"
        SET "lastLoginAt" = ${trialStartedAt}
        WHERE "id" = ${user.id}::uuid
      `;

      return { shop, user };
    });

    await setSessionCookie({
      userId: result.user.id,
      shopId: result.shop.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      shopName: result.shop.name,
      currency: result.shop.currency,
      sessionVersion: result.user.version,
    });

    await captureServerEvent({
      event: ANALYTICS_EVENTS.SIGNUP_COMPLETED,
      distinctId: result.user.id,
      shopId: result.shop.id,
      countryCode: result.shop.countryCode,
      properties: {
        currency: result.shop.currency,
        membership_role: "OWNER",
      },
    });

    return result;
  },

  async loginUser(input: LoginInput, requestFingerprint: string) {
    const validated = loginSchema.parse(input);
    const normalizedEmail = validated.email.toLowerCase().trim();

    await loginRateLimitService.assertAllowed(normalizedEmail, requestFingerprint);

    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
      include: {
        shop: true,
      },
    });

    if (!user || !user.shop || user.shop.deletedAt !== null) {
      await loginRateLimitService.recordFailure(normalizedEmail, requestFingerprint);
      throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }

    if (!user.passwordHash) {
      await loginRateLimitService.recordFailure(normalizedEmail, requestFingerprint);
      throw new Error("الحساب بحاجة لتعيين كلمة مرور جديدة");
    }

    const isValid = await verifyPassword(validated.password, user.passwordHash);
    if (!isValid) {
      await loginRateLimitService.recordFailure(normalizedEmail, requestFingerprint);
      throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }

    await loginRateLimitService.clearFailures(normalizedEmail, requestFingerprint);

    await prisma.$executeRaw`
      UPDATE "User"
      SET "lastLoginAt" = NOW()
      WHERE "id" = ${user.id}::uuid
    `;

    await setSessionCookie({
      userId: user.id,
      shopId: user.shop.id,
      email: user.email,
      name: user.name,
      role: user.role,
      shopName: user.shop.name,
      currency: user.shop.currency,
      sessionVersion: user.version,
    });

    await captureServerEvent({
      event: ANALYTICS_EVENTS.LOGIN_COMPLETED,
      distinctId: user.id,
      shopId: user.shop.id,
      countryCode: user.shop.countryCode,
      properties: {
        currency: user.shop.currency,
        user_role: user.role,
      },
    });

    return { user, shop: user.shop };
  },

  async logout() {
    await clearSessionCookie();
  },

  async getCurrentSession() {
    return getSession();
  },
};
