"use client";

import { useState } from "react";
import { Banknote, Landmark, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPaymentVoucherAction, createReceiptVoucherAction } from "./actions";

type Option = { id: string; name: string };
type Mode = "RECEIPT" | "PAYMENT";
type AccountType = "DRAWER" | "WALLET" | "BANK" | "OTHER";

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

export function VoucherForm({ mode, customers, suppliers, wallets, banks }: { mode: Mode; customers: Option[]; suppliers: Option[]; wallets: Option[]; banks: Option[] }) {
  const [accountType, setAccountType] = useState<AccountType>("DRAWER");
  const isReceipt = mode === "RECEIPT";
  const action = isReceipt ? createReceiptVoucherAction : createPaymentVoucherAction;

  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>المبلغ</span><input name="amount" type="number" min="0.01" step="0.01" required className={field} placeholder="0.00" /></label>

    {isReceipt ? <>
      <label className="grid gap-2 text-xs font-black text-slate-700"><span>العميل - اختياري</span><select name="customerId" className={field} defaultValue=""><option value="">بدون ربط بعميل</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-2 text-xs font-black text-slate-700"><span>اسم الدافع</span><input name="payerName" className={field} placeholder="اسم الدافع إن لم يكن عميلًا" /></label>
    </> : <>
      <label className="grid gap-2 text-xs font-black text-slate-700"><span>المورد - اختياري</span><select name="supplierId" className={field} defaultValue=""><option value="">بدون ربط بمورد</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-2 text-xs font-black text-slate-700"><span>اسم المستفيد</span><input name="payeeName" className={field} placeholder="اسم المستفيد إن لم يكن موردًا" /></label>
    </>}

    <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>الحساب المالي</span><select name="accountType" value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} className={field}><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK">حساب بنكي</option><option value="OTHER">مصدر خارجي / غير مربوط</option></select></label>

    {accountType === "WALLET" ? <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>المحفظة</span><select name="walletId" required className={field} defaultValue=""><option value="" disabled>اختر المحفظة</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
    {accountType === "BANK" ? <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>الحساب البنكي</span><select name="bankAccountId" required className={field} defaultValue=""><option value="" disabled>اختر الحساب البنكي</option>{banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
    {accountType === "OTHER" ? <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>اسم المصدر</span><input name="sourceName" className={field} placeholder="مثال: صندوق خارجي أو حوالة" /></label> : null}

    <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>السبب</span><input name="reason" required className={field} placeholder={isReceipt ? "مثال: دفعة مقدمة للصيانة" : "مثال: سداد خدمة خارجية"} /></label>
    <label className="grid gap-2 text-xs font-black text-slate-700"><span>مرجع - اختياري</span><input name="reference" className={field} placeholder="رقم فاتورة / حوالة" /></label>
    <label className="grid gap-2 text-xs font-black text-slate-700"><span>ملاحظات</span><input name="notes" className={field} /></label>

    <Button type="submit" className="font-black sm:col-span-2">{accountType === "BANK" ? <Landmark className="ml-1 h-4 w-4" /> : accountType === "WALLET" ? <WalletCards className="ml-1 h-4 w-4" /> : <Banknote className="ml-1 h-4 w-4" />}{isReceipt ? "حفظ سند القبض" : "حفظ سند الصرف"}</Button>
  </form>;
}
