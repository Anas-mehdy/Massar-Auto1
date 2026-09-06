import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { purchaseDocumentImportService } from "@/lib/services/purchaseDocumentImportService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function quotedFileName(name: string) {
  return name.replace(/["\\\r\n]/g, "_").slice(0, 180) || "invoice-source";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("inventory:read", { allowRedirect: false });
    const { id } = await context.params;
    const sourceId = z.string().uuid().parse(id);
    const file = await purchaseDocumentImportService.getSourceFile(auth.shop.id, sourceId);
    if (!file?.fileData) return NextResponse.json({ error: "الملف غير موجود أو لا يخص هذا المتجر." }, { status: 404 });
    return new NextResponse(new Uint8Array(file.fileData), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${quotedFileName(file.fileName || "invoice-source")}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر فتح الملف." }, { status: 404 });
  }
}
