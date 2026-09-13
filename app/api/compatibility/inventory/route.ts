import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      code: "FEATURE_RETIRED",
      error: "توافق مخزون أجهزة الهواتف غير متاح في نسخة مسار لصيانة المركبات.",
    },
    { status: 410 },
  );
}
