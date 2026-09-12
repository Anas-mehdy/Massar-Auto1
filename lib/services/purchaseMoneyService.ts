import { MembershipStatus, Prisma } from "@prisma/client";
import { hasRolePermission } from "@/lib/auth/permissions";
import { assertBusinessDateOpenTx } from "@/lib/services/businessDateLockService";
import { moneyAccountService } from "@/lib/services/moneyAccountService";

export type PurchaseMoneyAccountType = "DRAWER" | "WALLET" | "BANK" | "OTHER";

export async function preparePurchaseMoneyAccount(shopId: string, accountType: PurchaseMoneyAccountType) {
  await moneyAccountService.prepareMoneyAccounts(shopId, accountType);
}

export async function assertPurchaseFinancePermissionTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
) {
  if (!userId) throw new Error("تعذر التحقق من صلاحية المستخدم المالية.");
  const membership = await tx.membership.findFirst({
    where: {
      shopId,
      userId,
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
    },
    select: { role: true },
  });
  if (!membership || !hasRolePermission(membership.role, "finance:vouchers")) {
    throw new Error("لا تملك صلاحية تنفيذ حركة مالية على المشتريات.");
  }
}

export async function applyPurchasePaymentTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string | null;
    purchaseId: string;
    sourceReference: string;
    amount: string | number | Prisma.Decimal;
    accountType: PurchaseMoneyAccountType;
    walletId?: string | null;
    bankAccountId?: string | null;
    reference?: string | null;
    occurredAt?: Date;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();
  await assertPurchaseFinancePermissionTx(tx, input.shopId, input.userId);
  await assertBusinessDateOpenTx(tx, input.shopId, occurredAt);
  if (input.accountType === "OTHER") return null;

  return moneyAccountService.applyOutgoingMoneyTx(tx, input.shopId, input.userId, {
    destination: input.accountType,
    walletId: input.walletId ?? undefined,
    bankAccountId: input.bankAccountId ?? undefined,
    amount: input.amount,
    reference: input.reference ?? input.sourceReference,
    description: `دفع فاتورة شراء — ${input.sourceReference}`,
    movementType: "PURCHASE_PAYMENT",
    contextLabel: `فاتورة الشراء ${input.sourceReference}`,
    occurredAt,
    source: {
      sourceType: "PURCHASE",
      sourceId: input.purchaseId,
      sourceReference: input.sourceReference,
    },
  });
}

export async function applySupplierRefundTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string | null;
    purchaseId: string;
    supplierReturnId: string;
    sourceReference: string;
    amount: string | number | Prisma.Decimal;
    accountType: PurchaseMoneyAccountType;
    walletId?: string | null;
    bankAccountId?: string | null;
    reference?: string | null;
    occurredAt?: Date;
  },
) {
  const occurredAt = input.occurredAt ?? new Date();
  await assertPurchaseFinancePermissionTx(tx, input.shopId, input.userId);
  await assertBusinessDateOpenTx(tx, input.shopId, occurredAt);
  if (input.accountType === "OTHER") return null;

  return moneyAccountService.applyIncomingMoneyTx(tx, input.shopId, input.userId, {
    destination: input.accountType,
    walletId: input.walletId ?? undefined,
    bankAccountId: input.bankAccountId ?? undefined,
    amount: input.amount,
    reference: input.reference ?? input.sourceReference,
    description: `مبلغ مسترد من مورد — ${input.sourceReference}`,
    drawerType: "INVOICE_PAYMENT",
    movementType: "SUPPLIER_REFUND",
    occurredAt,
    source: {
      sourceType: "SUPPLIER_RETURN",
      sourceId: input.supplierReturnId,
      sourceReference: input.sourceReference,
    },
  });
}

export const purchaseMoneyService = {
  preparePurchaseMoneyAccount,
  assertPurchaseFinancePermissionTx,
  applyPurchasePaymentTx,
  applySupplierRefundTx,
};
