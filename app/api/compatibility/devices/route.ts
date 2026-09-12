import { NextRequest, NextResponse } from "next/server";
import {
  AuthenticationError,
  AuthorizationError,
  requirePermission,
} from "@/lib/auth/context";
import { compatibilitySearchService } from "@/lib/services/compatibility/compatibility-search.service";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";

export const dynamic = "force-dynamic";

function subscriptionExpiredResponse(message: string) {
  return NextResponse.json(
    {
      success: false,
      allowed: false,
      code: "SUBSCRIPTION_EXPIRED",
      message,
      error: message,
      upgradeUrl: "/subscription",
    },
    { status: 403 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("inventory:read", { allowRedirect: false });

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || searchParams.get("query") || "").trim();
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;

    if (query.length < 2) {
      return NextResponse.json({ success: true, query, results: [] });
    }

    const entitlement = await entitlementService.checkCanPerformCompatibilitySearch(auth.shop.id);
    if (!entitlement.allowed) {
      return subscriptionExpiredResponse(entitlement.message);
    }

    const results = await compatibilitySearchService.searchDevices(query, { limit });
    return NextResponse.json({ success: true, query, results });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول للبحث في دليل التوافقات." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: "لا تملك صلاحية قراءة المخزون." }, { status: 403 });
    }
    console.error("Compatibility device search API error:", error);
    return NextResponse.json(
      { success: false, error: "تعذر البحث عن الأجهزة حالياً." },
      { status: 500 },
    );
  }
}
