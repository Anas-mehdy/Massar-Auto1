import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Checks if the given email is authorized as a Super Admin.
 * Configured exclusively via SUPER_ADMIN_EMAILS (comma-separated).
 * Missing or empty configuration always fails closed in every environment.
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;

  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    return false;
  }

  return adminEmails.includes(email.toLowerCase().trim());
}

/**
 * Enforces Super Admin access in server components and server actions.
 */
export async function requireSuperAdmin() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/admin");
  }

  if (!isSuperAdminEmail(session.email)) {
    redirect("/dashboard?error=unauthorized_admin");
  }

  return session;
}
