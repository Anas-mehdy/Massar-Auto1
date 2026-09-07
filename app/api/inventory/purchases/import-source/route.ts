import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalSubscription, requirePermission } from "@/lib/auth/context";
import { purchaseDocumentImportService } from "@/lib/services/purchaseDocumentImportService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "بيانات الرفع غير صالحة.";
  return error instanceof Error ? error.message : "تعذر رفع الملف.";
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("inventory:manage", { allowRedirect: false });
    await requireOperationalSubscription(auth.shop.id);
    // Vercel Functions currently cap the whole request payload at 4.5 MB.
    // Keep the application file limit at 4 MB and reject obviously oversized
    // multipart requests before allocating their body when Content-Length exists.
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > Math.floor(4.45 * 1024 * 1024)) {
      return NextResponse.json({ ok: false, error: "حجم طلب الرفع يتجاوز حد الاستضافة. ارفع ملفاً أصغر من 4MB." }, { status: 413 });
    }
    const form = await request.formData();
    const purchaseId = z.string().uuid("معرّف المسودة غير صالح").parse(form.get("purchaseId"));
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "اختر صورة أو PDF أولاً." }, { status: 400 });

    const limits = purchaseDocumentImportService.getPurchaseImportLimits();
    if (file.size <= 0) return NextResponse.json({ ok: false, error: "الملف فارغ." }, { status: 400 });
    if (file.size > limits.maxFileBytes) {
      return NextResponse.json({ ok: false, error: `حجم الملف أكبر من الحد الحالي (${limits.maxFileMb} MB).` }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await purchaseDocumentImportService.createFileSource({
      shopId: auth.shop.id,
      userId: auth.user.id,
      purchaseInvoiceId: purchaseId,
      fileName: file.name,
      declaredMimeType: file.type,
      bytes,
    });
    return NextResponse.json({
      ok: true,
      sourceId: result.source.id,
      status: result.source.status,
      sourceType: result.source.sourceType,
      fileName: result.source.fileName,
      pageCount: result.source.pageCount,
      reused: result.reused,
      limits: { maxFileMb: limits.maxFileMb, maxPdfPages: limits.maxPdfPages },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
