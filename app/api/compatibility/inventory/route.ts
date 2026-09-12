import { NextRequest, NextResponse } from "next/server";
import { PartCategory } from "@prisma/client";
import {
  AuthenticationError,
  AuthorizationError,
  requirePermission,
} from "@/lib/auth/context";
import { smartInventoryMatcherService } from "@/lib/services/compatibility/inventory-matcher.service";
import { DeviceNotFoundError } from "@/lib/services/compatibility/compatibility.errors";
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

    const entitlement = await entitlementService.checkCanPerformCompatibilitySearch(auth.shop.id);
    if (!entitlement.allowed) {
      return subscriptionExpiredResponse(entitlement.message);
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    const categoryParam = searchParams.get("category");
    const includeOutOfStock = searchParams.get("includeOutOfStock") === "true";
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId query parameter is required." },
        { status: 400 },
      );
    }

    let category: PartCategory | undefined;
    if (categoryParam && Object.values(PartCategory).includes(categoryParam as PartCategory)) {
      category = categoryParam as PartCategory;
    }

    const response = await smartInventoryMatcherService.getAvailableCompatibleParts(deviceId, {
      shopId: auth.shop.id,
      category,
      includeOutOfStock,
      limit,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول لعرض توافقات المخزون." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: "لا تملك صلاحية قراءة المخزون." }, { status: 403 });
    }
    console.error("Inventory Matcher API error:", error);
    if (error instanceof DeviceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to execute inventory compatibility matching." },
      { status: 500 },
    );
  }
}
