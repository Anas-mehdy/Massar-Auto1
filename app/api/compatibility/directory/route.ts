import { NextRequest, NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  requirePermission,
} from "@/lib/auth/context";
import { searchCompatibilityDirectory } from "@/lib/services/compatibility/compatibility-directory.service";
import { isCompatibilityDatasetKey } from "@/lib/services/compatibility/compatibility-datasets";
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
    const query = (searchParams.get("q") || "").trim();
    const requestedDataset = (searchParams.get("dataset") || searchParams.get("category") || "SCREEN").toUpperCase();
    const dataset = isCompatibilityDatasetKey(requestedDataset) ? requestedDataset : "SCREEN";
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "30", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 30;

    if (query.length < 2) {
      return NextResponse.json({ success: true, query, results: [] });
    }

    const entitlement = await entitlementService.checkCanPerformCompatibilitySearch(auth.shop.id);
    if (!entitlement.allowed) {
      return subscriptionExpiredResponse(entitlement.message);
    }

    const results = await searchCompatibilityDirectory(query, {
      shopId: auth.shop.id,
      dataset,
      limit,
    });
    return NextResponse.json({ success: true, query, results });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول لاستخدام دليل التوافقات." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: "لا تملك صلاحية قراءة المخزون." }, { status: 403 });
    }
    console.error("Compatibility directory API error:", error);
    return NextResponse.json(
      { success: false, error: "تعذر البحث في دليل التوافقات حالياً." },
      { status: 500 },
    );
  }
}
