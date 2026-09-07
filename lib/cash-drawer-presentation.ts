import type { CashDrawerMovementRow, CashDrawerSourceType } from "@/lib/services/cashDrawerService";

export function cashDrawerMovementLabel(movement: Pick<CashDrawerMovementRow, "type" | "direction" | "sourceType">) {
  const movementType = String(movement.type);
  const sourceType = String(movement.sourceType);
  if (movementType === "ELECTRONIC_SERVICE_PAYMENT") return "تحصيل خدمة إلكترونية";
  if (movementType === "PURCHASE_PAYMENT") return "دفع فاتورة شراء";
  if (movementType === "SUPPLIER_REFUND") return "استرداد من مورد";
  if (movementType === "EXPENSE_PAYMENT") return "دفع مصروف";
  if (movementType === "SUPPLIER_PAYMENT") return "دفعة للمورد";
  switch (movement.type) {
    case "OPENING_BALANCE": return "الرصيد الافتتاحي";
    case "MANUAL_IN": return "إضافة نقد للدرج";
    case "MANUAL_OUT": return "سحب نقد من الدرج";
    case "WALLET_TRANSFER_IN": return "تحويل من محفظة";
    case "WALLET_TRANSFER_OUT": return "تحويل إلى محفظة";
    case "SALE_CASH": return "تحصيل مبيعة";
    case "INVOICE_PAYMENT": return "تحصيل فاتورة / خدمة";
    case "INSTALLMENT_PAYMENT": return "تحصيل قسط";
    case "INSTALLMENT_DOWN_PAYMENT": return "دفعة أولى للأقساط";
    case "DEBT_PAYMENT": return "تحصيل دين";
    case "CHANGE_RETURN": return sourceType === "INVOICE" ? "إرجاع باقي فاتورة / خدمة" : "إرجاع باقي مبيعة";
    default: return movement.direction === "IN" ? "دخول نقد" : "خروج نقد";
  }
}

export function cashDrawerSourceHref(movement: Pick<CashDrawerMovementRow, "sourceType" | "sourceId" | "customerId" | "financialTransferId">) {
  const sourceType = String(movement.sourceType);
  if (sourceType === "ELECTRONIC_SERVICE" && movement.sourceId) return `/electronic-services/new?transaction=${movement.sourceId}`;
  if ((sourceType === "SALE" || sourceType === "SALE_CHANGE") && movement.sourceId) return `/sales/${movement.sourceId}`;
  if (sourceType === "INVOICE" && movement.sourceId) return `/invoices/${movement.sourceId}`;
  if ((sourceType === "INSTALLMENT" || sourceType === "INSTALLMENT_DOWN_PAYMENT") && movement.sourceId) return `/installments/${movement.sourceId}`;
  if (sourceType === "DEBT" && movement.customerId) return `/debts/${movement.customerId}`;
  if (sourceType === "CASH_DRAWER_TRANSFER" && movement.financialTransferId) return `/transfers/${movement.financialTransferId}`;
  if ((sourceType === "PURCHASE" || sourceType === "SUPPLIER_RETURN") && movement.sourceId) return `/inventory/purchases/${movement.sourceId}`;
  if (sourceType === "EXPENSE" && movement.sourceId) return `/reports?expense=${movement.sourceId}#expense-${movement.sourceId}`;
  if (sourceType === "SUPPLIER" && movement.sourceId) return `/suppliers/${movement.sourceId}`;
  return null;
}

export function cashDrawerSourceLinkLabel(sourceType: CashDrawerSourceType) {
  const source = String(sourceType);
  if (source === "ELECTRONIC_SERVICE") return "فتح الخدمة الإلكترونية";
  if (source === "SALE" || source === "SALE_CHANGE") return "فتح المبيعة";
  if (source === "INVOICE") return "فتح الفاتورة";
  if (source === "INSTALLMENT" || source === "INSTALLMENT_DOWN_PAYMENT") return "فتح خطة الأقساط";
  if (source === "DEBT") return "فتح دفتر الدين";
  if (source === "CASH_DRAWER_TRANSFER") return "فتح حركة المحفظة";
  if (source === "PURCHASE" || source === "SUPPLIER_RETURN") return "فتح فاتورة الشراء";
  if (source === "EXPENSE") return "فتح المصروف";
  if (source === "SUPPLIER") return "فتح حساب المورد";
  return "فتح المصدر";
}

export function cashDrawerSourceLabel(sourceType: CashDrawerSourceType) {
  const source = String(sourceType);
  if (source === "ELECTRONIC_SERVICE") return "خدمة إلكترونية";
  if (source === "SALE") return "مبيعة";
  if (source === "SALE_CHANGE") return "باقي مبيعة";
  if (source === "INVOICE") return "فاتورة / خدمة";
  if (source === "INSTALLMENT") return "خطة أقساط";
  if (source === "INSTALLMENT_DOWN_PAYMENT") return "دفعة أولى";
  if (source === "DEBT") return "دفتر دين";
  if (source === "CASH_DRAWER_TRANSFER") return "تحويل محفظة";
  if (source === "PURCHASE") return "فاتورة شراء";
  if (source === "SUPPLIER_RETURN") return "مرتجع مورد";
  if (source === "EXPENSE") return "مصروف";
  if (source === "SUPPLIER") return "حساب مورد";
  return "حركة يدوية";
}
