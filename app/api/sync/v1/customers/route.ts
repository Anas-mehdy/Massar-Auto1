import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthorizationError,
  can,
  getAuthContext,
  requireOperationalSubscription,
} from "@/lib/auth/context";
import {
  applySyncMutation,
  pullCustomerChanges,
  syncMutationSchema,
} from "@/lib/offline/serverSyncService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const syncRequestSchema = z.object({
  cursor: z.string().regex(/^\d+$/).default("0"),
  mutations: z.array(syncMutationSchema).max(100).default([]),
});

function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "تعذر تنفيذ المزامنة.";
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext({ allowRedirect: false });
    const cursorRaw = request.nextUrl.searchParams.get("cursor") ?? "0";
    if (!/^\d+$/.test(cursorRaw)) {
      return NextResponse.json({ ok: false, error: "مؤشر المزامنة غير صالح." }, { status: 400 });
    }

    const pull = await pullCustomerChanges(auth.shop.id, BigInt(cursorRaw));
    return NextResponse.json({ ok: true, pull });
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext({ allowRedirect: false });
    const parsed = syncRequestSchema.parse(await request.json());

    if (parsed.mutations.length > 0) {
      if (!can(auth, "customers:manage")) {
        throw new AuthorizationError("لا تملك صلاحية تعديل العملاء.");
      }
      if (parsed.mutations.some((mutation) => mutation.mutationType === "customer.delete") && !can(auth, "customers:delete")) {
        throw new AuthorizationError("لا تملك صلاحية حذف العملاء.");
      }
      await requireOperationalSubscription(auth.shop.id);
    }

    const results = [];
    for (const mutation of parsed.mutations) {
      results.push(await applySyncMutation(mutation, {
        shopId: auth.shop.id,
        userId: auth.user.id,
      }));
    }

    const pull = await pullCustomerChanges(auth.shop.id, BigInt(parsed.cursor));
    return NextResponse.json({ ok: true, results, pull });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "طلب المزامنة غير صالح." },
        { status: 400 },
      );
    }
    if (error instanceof AuthorizationError) {
      return jsonError(error, 403);
    }
    return jsonError(error, 400);
  }
}
