import { ArrowRight, Clock3, ExternalLink, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import {
  transferCustomerDisplayName,
  transferSourceHref,
  transferSourceLabel,
  transferSourceLinkLabel,
} from "@/lib/financial-transfer-presentation";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { financialTransferService, type TransferDetailsRow } from "@/lib/services/financialTransferService";
import { WalletActivationSuccess } from "../_activation-success";
import { formatDateTimeInTimeZone, getShopTimeZone } from "@/lib/shop-timezone";

export const dynamic = "force-dynamic";

function cleanNotes(value: string | null) {
  if (!value) return "—";
  return value.replace(/\s*\[(?:INSTALLMENT-PAYMENT|INSTALLMENT-DOWN|DEBT-PAYMENT):[0-9a-f-]+\]\s*/gi, "").trim() || "—";
}

function settlementLabel(transfer: TransferDetailsRow) {
  if (transfer.settlementType === "DEBT") return "آجل — دفتر ديون العميل";
  if (transfer.settlementType === "CASH_DRAWER") {
    return transfer.operationType === "CUSTOMER_DEPOSIT" ? "نقدي — استلام في الدرج" : "نقدي — صرف من الدرج";
  }
  if (transfer.settlementType === "WALLET") {
    const walletName = transfer.settlementWalletName || "محفظة أخرى";
    return transfer.operationType === "CUSTOMER_DEPOSIT" ? `استلام على ${walletName}` : `صرف من ${walletName}`;
  }
  return transfer.isDeferred ? "آجل — مرتبط بدفتر الديون" : "فوري — حركة قديمة بدون تسوية مرتبطة";
}

export default async function TransferDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onboarding?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getCurrentShopContext();
  const [transfer, timeZone] = await Promise.all([
    financialTransferService.getTransferById(context.shopId, id),
    getShopTimeZone(context.shopId),
  ]);
  if (!transfer) notFound();

  const onboardingWallet = query.onboarding === "1"
    ? (await financialTransferService.listWallets(context.shopId)).find((wallet) => wallet.id === transfer.walletId) ?? null
    : null;

  let resolvedCustomerId = transfer.customerId;
  if (transfer.sourceType === "DEBT" && !resolvedCustomerId && transfer.notes) {
    const token = /\[DEBT-PAYMENT:([0-9a-f-]+)\]/i.exec(transfer.notes)?.[1];
    if (token) {
      const rows = await prisma.$queryRaw<Array<{ customerId: string }>>`
        SELECT "customerId" FROM "DebtLedgerEntry"
        WHERE "id" = ${token}::uuid AND "shopId" = ${context.shopId}::uuid
        LIMIT 1
      `;
      resolvedCustomerId = rows[0]?.customerId ?? null;
    }
  }

  const sourceHref = transferSourceHref({ sourceType: transfer.sourceType, sourceId: transfer.sourceId, customerId: resolvedCustomerId });
  const sourceLabel = transferSourceLabel(transfer.sourceType, transfer.operationType);
  const customerName = transferCustomerDisplayName(transfer);
  const walletIncreases = transfer.operationType === "CUSTOMER_WITHDRAWAL" || transfer.operationType === "WALLET_TOPUP";
  const walletDelta = `${walletIncreases ? "+" : "−"} ${formatCurrency(transfer.walletAmount, context.currency)}`;
  const settlementAmount = transfer.settlementAmount == null ? "—" : formatCurrency(transfer.settlementAmount, context.currency);

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <Link href="/transfers" className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:underline"><ArrowRight className="h-4 w-4" />العودة إلى سجل التحويلات</Link>
          <div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-slate-950">تفاصيل الحركة المالية</h1><span className={`rounded-full px-3 py-1 text-[11px] font-black ${transfer.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{transfer.status === "ACTIVE" ? "فعالة" : "ملغاة"}</span></div>
          <p className="mt-1 text-sm font-bold text-slate-500">{sourceLabel}{transfer.sourceReference ? ` — ${transfer.sourceReference}` : ""}</p>
        </div>
        {sourceHref ? <Button asChild className="h-11 rounded-xl bg-teal-600 px-5 font-black hover:bg-teal-700"><Link href={sourceHref}><ExternalLink className="ml-2 h-4 w-4" />{transferSourceLinkLabel(transfer.sourceType)}</Link></Button> : null}
      </div>

      {query.onboarding === "1" && onboardingWallet ? (
        <WalletActivationSuccess walletName={onboardingWallet.name} currentBalance={Number(onboardingWallet.currentBalance)} currency={context.currency} />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="مبلغ الحركة" value={formatCurrency(transfer.amount, context.currency)} />
        <Metric label="أثرها على المحفظة" value={walletDelta} />
        <Metric label="العمولة" value={formatCurrency(transfer.commission, context.currency)} />
        <Metric label="المحفظة" value={transfer.walletName} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4"><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-teal-600" /><h2 className="font-black text-slate-900">بيانات العملية الكاملة</h2></div></div>
        <dl className="grid gap-0 sm:grid-cols-2">
          <Info label="ماهية الحركة" value={sourceLabel} />
          <Info label="نوع حركة المحفظة" value={operationLabel(transfer.operationType)} />
          <Info label="المرجع" value={transfer.sourceReference || "—"} />
          <Info label="رقم الحركة" value={transfer.id} numeric />
          <Info label="العميل" value={customerName} />
          <Info label="هاتف العميل" value={transfer.customerPhone || "—"} numeric />
          <Info label="طريقة التنفيذ" value={transfer.isDeferred ? "آجل — مرتبط بدفتر الديون" : "فوري"} />
          <Info label="حالة العمولة" value={commissionLabel(transfer.commissionMode)} />
          <Info label="تسوية المقابل" value={settlementLabel(transfer)} />
          <Info label="مبلغ التسوية" value={settlementAmount} />
          <Info label="محفظة التسوية" value={transfer.settlementWalletName || "—"} />
          <Info label="حركة المحفظة المرتبطة" value={transfer.settlementTransferId || "—"} numeric />
          <Info label="حركة الدرج المرتبطة" value={transfer.settlementCashMovementId || "—"} numeric />
          <Info label="نفذها" value={transfer.createdByName || "غير معروف"} />
          <Info label="وقت العملية" value={formatDateTimeInTimeZone(transfer.createdAt, timeZone)} />
          <Info label="المنطقة الزمنية" value={timeZone} numeric />
          {transfer.voidedAt ? <Info label="وقت الإلغاء" value={formatDateTimeInTimeZone(transfer.voidedAt, timeZone)} /> : <Info label="وقت الإلغاء" value="—" />}
          {transfer.voidedAt ? <Info label="ألغيت بواسطة" value={transfer.voidedByName || "غير معروف"} /> : <Info label="ألغيت بواسطة" value="—" />}
        </dl>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><WalletCards className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">البيان والملاحظات</h2><p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{cleanNotes(transfer.notes)}</p></div></div>
      </section>

      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-xs font-bold leading-6 text-cyan-900">
        <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>الوقت المعروض محسوب تلقائياً حسب بلد المتجر المختار في مسار، وليس حسب توقيت جهاز المستخدم. المنطقة المستخدمة لهذه العملية: <b>{timeZone}</b>.</span></div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-black text-slate-500">{label}</div><div className="mt-2 break-words font-numeric text-lg font-black text-slate-950">{value}</div></div>;
}
function Info({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return <div className="border-b border-slate-100 px-5 py-4 sm:odd:border-l"><dt className="text-xs font-black text-slate-400">{label}</dt><dd className={`mt-1 break-words text-sm font-black text-slate-800 ${numeric ? "font-numeric" : ""}`}>{value}</dd></div>;
}
function operationLabel(type: "CUSTOMER_DEPOSIT" | "CUSTOMER_WITHDRAWAL" | "WALLET_TOPUP" | "WALLET_WITHDRAWAL") {
  return { CUSTOMER_DEPOSIT: "إيداع للعميل", CUSTOMER_WITHDRAWAL: "سحب للعميل", WALLET_TOPUP: "زيادة رصيد المحفظة", WALLET_WITHDRAWAL: "نقص رصيد المحفظة" }[type];
}
function commissionLabel(mode: "ADDED" | "DEDUCTED" | "NONE") {
  return { ADDED: "مضافة", DEDUCTED: "مخصومة", NONE: "بدون عمولة" }[mode];
}
