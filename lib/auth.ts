import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const DEV_AUTH_SECRET = "massar-auto-local-dev-session-secret-2026-only";
const COOKIE_NAME = "phone_repair_session";

function getJwtSecret() {
  const configuredSecret = process.env.AUTH_SECRET?.trim();

  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters long.");
    }
    return new TextEncoder().encode(configuredSecret);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }

  return new TextEncoder().encode(DEV_AUTH_SECRET);
}

export interface SessionPayload {
  userId: string;
  shopId: string;
  email: string;
  name: string;
  role: string;
  shopName: string;
  currency: string;
  sessionVersion: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const secret = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { version: true, deletedAt: true },
  });

  // Existing sessions created before sessionVersion was introduced are version 1.
  const tokenVersion = session.sessionVersion ?? 1;
  if (!user || user.deletedAt !== null || user.version !== tokenVersion) {
    return null;
  }

  return { ...session, sessionVersion: tokenVersion };
}
