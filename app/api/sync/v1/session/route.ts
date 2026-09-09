import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createOfflineSessionExpiry } from "@/lib/offline/offlineSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthContext({ allowRedirect: false });
    const issuedAt = new Date();
    const expiresAt = createOfflineSessionExpiry(issuedAt);

    return NextResponse.json({
      ok: true,
      session: {
        user: auth.user,
        shop: auth.shop,
        membership: auth.membership,
        permissions: auth.permissions,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحديث جلسة العمل المحلية.";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
