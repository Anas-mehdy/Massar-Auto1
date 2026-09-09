import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { purchaseDocumentImportService } from "@/lib/services/purchaseDocumentImportService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asciiFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\\r\n;]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "invoice-source";
}

function encodedFileName(name: string) {
  const cleaned = name.replace(/[\r\n]/g, " ").trim().slice(0, 240) || "invoice-source";
  return encodeURIComponent(cleaned).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission("inventory:read", { allowRedirect: false });
    const { id } = await context.params;
    const sourceId = z.string().uuid().parse(id);
    const file = await purchaseDocumentImportService.getSourceFile(auth.shop.id, sourceId);
    if (!file?.fileData) return NextResponse.json({ error: "الملف غير موجود أو لا يخص هذا المتجر." }, { status: 404 });

    const fileName = file.fileName || "invoice-source";
    return new NextResponse(new Uint8Array(file.fileData), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encodedFileName(fileName)}`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر فتح الملف." }, { status: 404 });
  }
}
