import { ArrowDownCircle, ArrowUpCircle, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { voucherService } from "@/lib/services/voucherService";
import { VoucherForm } from "./_voucher-form";

export const dynamic = "force-dynamic";

type VoucherRow = {
  id: string;
  voucherNumber: string;
  amount: string | number;
  accountType: string;
  reason: string;
  status: string;
  receivedAt?: Date;
  paidAt?: Date;
  customerName?: string | null;
  supplierName?: string | null;
  payerName?: string | null;
  payeeName?: string | null;
};

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function date(value?: Date) {
  return value ? new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

export default async function VouchersPage() {
  const auth = await requirePermission("finance:vouchers");
  const [customers, suppliers, wallets, banks, receipts, payments] = await Promise.all([
    prisma.customer.findMany({ where: { shopId: auth.shop.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.supplier.findMany({ where: { shopId: auth.shop.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    financialTransferService.listWallets(auth.shop.id),
    bankAccountService.listAccounts(auth.shop.id),
    voucherService.listReceiptVouchers(auth.shop.id, 50),
    voucherService.listPaymentVouchers(auth.shop.id, 50),
  ]);

  const receiptRows = receipts as VoucherRow[];
  const paymentRows = payments as VoucherRow[];

  return <div className="space-y-6">
    <PageHeader title="سندات القبض والصرف" description="مستندات مالية مرقمة ومرتبطة مباشرة بالدرج أو المحفظة أو الحساب البنكي." />

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
        <div className="border-b border-emerald-100 bg-emerald-50/60 p-5"><h2 className="flex items-center gap-2 font-black text-emerald-950"><ArrowDownCircle className="h-5 w-5" />سند قبض</h2><p className="mt-1 text-xs font-semibold text-emerald-800">يزيد رصيد الحساب المحدد ويسجل مرجع السند على الحركة المالية.</p></div>
        <div className="p-5"><VoucherForm mode="RECEIPT" customers={customers} suppliers={[]} wallets={wallets.map((item) => ({ id: item.id, name: item.name }))} banks={banks.map((item) => ({ id: item.id, name: item.name }))} /></div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-100 bg-red-50/60 p-5"><h2 className="flex items-center gap-2 font-black text-red-950"><ArrowUpCircle className="h-5 w-5" />سند صرف</h2><p className="mt-1 text-xs font-semibold text-red-800">ينقص الرصيد فعليًا، ويُرفض إذا لم يكن الرصيد كافيًا.</p></div>
        <div className="p-5"><VoucherForm mode="PAYMENT" customers={[]} suppliers={suppliers} wallets={wallets.map((item) => ({ id: item.id, name: item.name }))} banks={banks.map((item) => ({ id: item.id, name: item.name }))} /></div>
      </section>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4 font-black text-slate-950"><ReceiptText className="h-4 w-4 text-emerald-700" />آخر سندات القبض</div>
        <div className="divide-y divide-slate-100">{receiptRows.map((row) => <div key={row.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-900">{row.voucherNumber}</div><div className="mt-1 text-xs font-bold text-slate-500">{row.customerName || row.payerName || "بدون طرف محدد"} • {row.reason}</div><div className="mt-1 text-[11px] text-slate-400">{date(row.receivedAt)} • {row.accountType}</div></div><div className="text-left"><div className="font-black text-emerald-700">{money(row.amount, auth.shop.currency)}</div><div className="mt-1 text-[11px] font-black text-slate-500">{row.status}</div></div></div></div>)}</div>
        {!receiptRows.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا توجد سندات قبض بعد.</div> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4 font-black text-slate-950"><ReceiptText className="h-4 w-4 text-red-700" />آخر سندات الصرف</div>
        <div className="divide-y divide-slate-100">{paymentRows.map((row) => <div key={row.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-900">{row.voucherNumber}</div><div className="mt-1 text-xs font-bold text-slate-500">{row.supplierName || row.payeeName || "بدون طرف محدد"} • {row.reason}</div><div className="mt-1 text-[11px] text-slate-400">{date(row.paidAt)} • {row.accountType}</div></div><div className="text-left"><div className="font-black text-red-700">{money(row.amount, auth.shop.currency)}</div><div className="mt-1 text-[11px] font-black text-slate-500">{row.status}</div></div></div></div>)}</div>
        {!paymentRows.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا توجد سندات صرف بعد.</div> : null}
      </section>
    </div>
  </div>;
}
