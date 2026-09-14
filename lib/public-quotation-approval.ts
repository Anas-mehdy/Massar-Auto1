import { timingSafeEqual } from "node:crypto";
import { hmacAuthValue } from "@/lib/auth/security";

const TOKEN_VERSION = "public-quotation-approval:v1";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

function tokenMessage(quotationId: string, serviceOrderId: string) {
  return `${TOKEN_VERSION}:${quotationId}:${serviceOrderId}`;
}

export function createPublicQuotationApprovalToken(quotationId: string, serviceOrderId: string) {
  return hmacAuthValue(tokenMessage(quotationId, serviceOrderId));
}

export function verifyPublicQuotationApprovalToken(
  token: string,
  quotationId: string,
  serviceOrderId: string,
) {
  if (!TOKEN_PATTERN.test(token)) return false;
  const expected = Buffer.from(createPublicQuotationApprovalToken(quotationId, serviceOrderId), "hex");
  const provided = Buffer.from(token, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function publicPhoneProof(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits.slice(-8) : null;
}
