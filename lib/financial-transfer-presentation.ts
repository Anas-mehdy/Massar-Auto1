import type {
  FinancialTransferSourceType,
  FinancialTransferType,
  TransferRow,
} from "@/lib/services/financialTransferService";

export function transferSourceLabel(sourceType: FinancialTransferSourceType, operationType: FinancialTransferType) {
  if (String(sourceType) === "ELECTRONIC_SERVICE") return "تحصيل خدمة إلكترونية";
  if (sourceType === "SALE") return "تحصيل مبيعة";
  if (sourceType === "SALE_CHANGE") return "إرجاع باقي مبيعة";
  if (sourceType === "INVOICE") return operationType === "WALLET_WITHDRAWAL" ? "إرجاع باقي فاتورة / خدمة" : "تحصيل فاتورة / خدمة";
  if (sourceType === "INSTALLMENT") return "تحصيل قسط";
  if (sourceType === "INSTALLMENT_DOWN_PAYMENT") return "دفعة أولى للأقساط";
  if (sourceType === "DEBT") return "تحصيل دين";
  if (sourceType === "EXPENSE") return "مصروف";
  if (sourceType === "CREDIT_NOTE") return "استرداد إشعار دائن";
  if (sourceType === "CASH_DRAWER_TRANSFER") return operationType === "WALLET_TOPUP" ? "تحويل من الدرج" : "تحويل إلى الدرج";
  if (sourceType === "CUSTOMER_TRANSFER") return operationType === "CUSTOMER_DEPOSIT" ? "إيداع للعميل" : "سحب للعميل";
  if (sourceType === "CUSTOMER_TRANSFER_SETTLEMENT") return operationType === "WALLET_TOPUP" ? "تسوية إيداع للعميل" : "تسوية سحب للعميل";
  if (sourceType === "SUPPLIER") return "دفعة للمورد";
  return operationType === "WALLET_TOPUP" ? "شحن محفظة يدوي" : "سحب يدوي من المحفظة";
}

export function transferSourceHref(transfer: Pick<TransferRow, "sourceType" | "sourceId" | "customerId">) {
  if (String(transfer.sourceType) === "ELECTRONIC_SERVICE") return transfer.sourceId ? `/electronic-services/new?transaction=${transfer.sourceId}` : null;
  if (transfer.sourceType === "SALE" || transfer.sourceType === "SALE_CHANGE") return transfer.sourceId ? `/sales/${transfer.sourceId}` : null;
  if (transfer.sourceType === "INVOICE") return transfer.sourceId ? `/invoices/${transfer.sourceId}` : null;
  if (transfer.sourceType === "INSTALLMENT" || transfer.sourceType === "INSTALLMENT_DOWN_PAYMENT") return transfer.sourceId ? `/installments/${transfer.sourceId}` : null;
  if (transfer.sourceType === "DEBT") return transfer.customerId ? `/debts/${transfer.customerId}` : null;
  if (transfer.sourceType === "EXPENSE") return transfer.sourceId ? `/reports?expense=${transfer.sourceId}#expense-${transfer.sourceId}` : `/reports`;
  if (transfer.sourceType === "CUSTOMER_TRANSFER_SETTLEMENT") return transfer.sourceId ? `/transfers/${transfer.sourceId}` : null;
  if (transfer.sourceType === "SUPPLIER") return transfer.sourceId ? `/suppliers/${transfer.sourceId}` : null;
  return null;
}

export function transferSourceLinkLabel(sourceType: FinancialTransferSourceType) {
  if (String(sourceType) === "ELECTRONIC_SERVICE") return "فتح الخدمة الإلكترونية";
  if (sourceType === "SALE" || sourceType === "SALE_CHANGE") return "فتح المبيعة";
  if (sourceType === "INVOICE") return "فتح الفاتورة";
  if (sourceType === "INSTALLMENT" || sourceType === "INSTALLMENT_DOWN_PAYMENT") return "فتح خطة الأقساط";
  if (sourceType === "DEBT") return "فتح دفتر الدين";
  if (sourceType === "EXPENSE") return "فتح المصروف";
  if (sourceType === "CUSTOMER_TRANSFER_SETTLEMENT") return "فتح العملية الأصلية";
  if (sourceType === "SUPPLIER") return "فتح حساب المورد";
  return "فتح المصدر";
}

export function transferCanVoid(sourceType: FinancialTransferSourceType) {
  return sourceType === "CUSTOMER_TRANSFER" || sourceType === "MANUAL";
}

export function transferCustomerDisplayName(transfer: Pick<TransferRow, "customerName" | "notes" | "sourceType">) {
  if (transfer.customerName) return transfer.customerName;
  if (transfer.sourceType === "DEBT" && transfer.notes) {
    const match = /تحصيل دين\s+(.+?)\s+\[DEBT-PAYMENT:/.exec(transfer.notes);
    if (match?.[1]) return match[1].trim();
  }
  return "—";
}
