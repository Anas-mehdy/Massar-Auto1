import {
  AuthenticationError,
  AuthorizationError,
  requirePermission,
} from "@/lib/auth/context";
import { supplierInvoiceAttachmentService } from "@/lib/services/supplierInvoiceAttachmentService";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let auth;
  try {
    auth = await requirePermission("inventory:read", { allowRedirect: false });
  } catch (error) {
    if (error instanceof AuthenticationError) return new Response("Unauthorized", { status: 401 });
    if (error instanceof AuthorizationError) return new Response("Forbidden", { status: 403 });
    throw error;
  }

  const { id } = await params;
  const attachment = await supplierInvoiceAttachmentService.getAttachmentFile(auth.shop.id, id);
  if (!attachment) return new Response("Not found", { status: 404 });

  const encodedName = encodeURIComponent(attachment.fileName).replace(/'/g, "%27");
  return new Response(new Uint8Array(attachment.fileData), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.fileSize),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
