export const PARTNER_CODE_MIN_LENGTH = 6;
export const PARTNER_CODE_MAX_LENGTH = 32;
export const PARTNER_DISCOUNT_MIN = 0;
export const PARTNER_DISCOUNT_MAX = 100;

export type PartnerKind = "AGENT" | "DISTRIBUTOR";
export type PartnerLifecycleStatus = "ACTIVE" | "SUSPENDED";

export interface PartnerCreateInput {
  code: string;
  type: PartnerKind;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  countryCode?: string | null;
  discountPercent: number;
  notes?: string | null;
}

export interface PartnerUpdateInput extends Partial<Omit<PartnerCreateInput, "code">> {
  code?: string;
  status?: PartnerLifecycleStatus;
}

export function normalizePartnerCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizePartnerCountryCode(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length === 0 ? null : normalized;
}

export function validatePartnerCode(value: string): string {
  const code = normalizePartnerCode(value);

  if (code.length < PARTNER_CODE_MIN_LENGTH || code.length > PARTNER_CODE_MAX_LENGTH) {
    throw new Error(`كود الوكيل يجب أن يكون بين ${PARTNER_CODE_MIN_LENGTH} و${PARTNER_CODE_MAX_LENGTH} حرفاً.`);
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error("كود الوكيل يقبل الأحرف الإنجليزية والأرقام والشرطة فقط.");
  }

  return code;
}

export function validatePartnerDiscount(value: number): number {
  if (!Number.isFinite(value) || value < PARTNER_DISCOUNT_MIN || value > PARTNER_DISCOUNT_MAX) {
    throw new Error("نسبة خصم الوكيل يجب أن تكون بين 0 و100.");
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validatePartnerCountryCode(value?: string | null): string | null {
  const countryCode = normalizePartnerCountryCode(value);

  if (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("رمز دولة الوكيل يجب أن يتكون من حرفين إنجليزيين.");
  }

  return countryCode;
}

export function sanitizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length === 0 ? null : normalized;
}
