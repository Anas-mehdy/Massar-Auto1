import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  AuthenticationError,
  AuthorizationError,
  requirePermission,
} from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { financialTransferService } from "@/lib/services/financialTransferService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("reports:read", { allowRedirect: false });
    const startRaw = request.nextUrl.searchParams.get("start");
    const endRaw = request.nextUrl.searchParams.get("end");
    const start = startRaw ? new Date(startRaw) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endRaw ? new Date(endRaw) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: "الفترة غير صحيحة." }, { status: 400 });
    }

    const shopId = auth.shop.id;
    const wallets = await financialTransferService.listWallets(shopId);
    const [drawer, walletPeriod] = await Promise.all([
      cashDrawerService.getReportSnapshot(shopId, start, end),
      prisma.$queryRaw<Array<{ inflow: Prisma.Decimal; outflow: Prisma.Decimal }>>`
        SELECT
          COALESCE(SUM("walletAmount") FILTER (WHERE "status" = 'ACTIVE' AND "operationType" IN ('CUSTOMER_WITHDRAWAL','WALLET_TOPUP')), 0) AS "inflow",
          COALESCE(SUM("walletAmount") FILTER (WHERE "status" = 'ACTIVE' AND "operationType" IN ('CUSTOMER_DEPOSIT','WALLET_WITHDRAWAL')), 0) AS "outflow"
        FROM "FinancialTransfer"
        WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
          AND "createdAt" >= ${start} AND "createdAt" < ${end}
      `,
    ]);
    const walletBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.currentBalance), 0);
    const walletInflow = Number(walletPeriod[0]?.inflow ?? 0);
    const walletOutflow = Number(walletPeriod[0]?.outflow ?? 0);

    return NextResponse.json({
      ...drawer,
      walletBalance,
      totalLiquidFunds: drawer.currentBalance + walletBalance,
      walletInflow,
      walletOutflow,
      walletNetMovement: walletInflow - walletOutflow,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "لا تملك صلاحية عرض التقارير المالية." }, { status: 403 });
    }
    return NextResponse.json({ error: "تعذر تحميل تقرير السيولة." }, { status: 500 });
  }
}
