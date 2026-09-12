import { SignJWT, jwtVerify } from "jose";
import { getAuthSecuritySecret } from "@/lib/auth/security";

function secret() {
  const configuredLinkSecret = process.env.INSTALLMENT_LINK_SECRET?.trim();
  const value = configuredLinkSecret || getAuthSecuritySecret();

  if (value.length < 32) {
    throw new Error("INSTALLMENT_LINK_SECRET must be at least 32 characters long.");
  }

  return new TextEncoder().encode(value);
}

export async function createInstallmentPublicToken(planId: string, version: number) {
  return new SignJWT({ planId, version })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("installment-customer-portal")
    .setIssuedAt()
    .setExpirationTime("5y")
    .sign(secret());
}

export async function verifyInstallmentPublicToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      audience: "installment-customer-portal",
    });
    if (typeof payload.planId !== "string" || typeof payload.version !== "number") return null;
    return { planId: payload.planId, version: payload.version };
  } catch {
    return null;
  }
}
