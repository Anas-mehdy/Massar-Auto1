import type { BankAccountMovementRow } from "@/lib/services/bankAccountService";

export function bankMovementLabel(type: string) {
  const labels: Record<string, string> = {
    OPENING_BALANCE: "رصيد افتتاحي",
    ADJUSTMENT_IN: "تسوية زيادة يدوية",
    ADJUSTMENT_OUT: "تسوية خفض يدوية",
    SALE_CASH: "تحصيل بيع",
    INVOICE_PAYMENT: "تحصيل فاتورة",
    CHANGE_RETURN: "إرجاع مبلغ",
    INSTALLMENT_PAYMENT: "تحصيل قسط",
    INSTALLMENT_DOWN_PAYMENT: "دفعة أولى",
    DEBT_PAYMENT: "تحصيل دين",
    EXPENSE: "مصروف",
    EXPENSE_PAYMENT: "دفع مصروف",
    PURCHASE_PAYMENT: "دفع مشتريات",
    SUPPLIER_PAYMENT: "دفعة للمورد",
    SUPPLIER_REFUND: "استرداد مورد",
    ELECTRONIC_SERVICE_PAYMENT: "تحصيل خدمة إلكترونية",
    SOFTWARE_SERVICE_PAYMENT: "تحصيل خدمة سوفتوير",
    TRANSFER_IN: "تحويل وارد",
    TRANSFER_OUT: "تحويل صادر",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export function bankSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    SALE: "عملية بيع",
    SALE_CHANGE: "باقي عملية بيع",
    INVOICE: "فاتورة",
    INSTALLMENT: "قسط",
    INSTALLMENT_DOWN_PAYMENT: "دفعة أولى لخطة أقساط",
    DEBT: "دفتر الديون",
    PURCHASE: "فاتورة شراء",
    SUPPLIER_RETURN: "مرتجع مورد",
    EXPENSE: "مصروف",
    ELECTRONIC_SERVICE: "خدمة إلكترونية",
    SOFTWARE_SERVICE: "خدمة سوفتوير",
    SUPPLIER: "مورد",
    BANK_TRANSFER: "تحويل داخلي",
    MANUAL: "حركة يدوية",
  };
  return labels[sourceType] ?? sourceType.replaceAll("_", " ");
}

export function bankSourceHref(movement: Pick<BankAccountMovementRow, "sourceType" | "sourceId" | "customerId" | "transferGroupId">) {
  const id = movement.sourceId;
  if (movement.sourceType === "SALE" && id) return `/sales/${id}`;
  if (movement.sourceType === "INVOICE" && id) return `/invoices/${id}`;
  if ((movement.sourceType === "INSTALLMENT" || movement.sourceType === "INSTALLMENT_DOWN_PAYMENT") && id) return `/installments/${id}`;
  if (movement.sourceType === "DEBT" && movement.customerId) return `/debts/${movement.customerId}`;
  if (movement.sourceType === "PURCHASE" && id) return `/inventory/purchases/${id}`;
  if (movement.sourceType === "ELECTRONIC_SERVICE" && id) return `/electronic-services/${id}`;
  if (movement.sourceType === "SOFTWARE_SERVICE" && id) return `/software-services/${id}`;
  if (movement.sourceType === "SUPPLIER" && id) return `/suppliers/${id}`;
  if (movement.sourceType === "BANK_TRANSFER" && movement.transferGroupId) return `/bank-accounts?transfer=${movement.transferGroupId}`;
  return null;
}
