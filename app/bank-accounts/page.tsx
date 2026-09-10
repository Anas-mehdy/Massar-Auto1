import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Building2, ExternalLink, Landmark, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { can, requirePermission } from "@/lib/auth/context";
import { bankMovementLabel, bankSourceLabel } from "@/lib/bank-account-presentation";
import { formatCurrency } from "@/lib/format";
import { bankAccountService, type BankMovementDirection, type BankMovementStatus } from "@/lib/services/bankAccountService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { dateInputEndUtcForTimeZone, dateInputStartUtcForTimeZone, timeZoneForCountry } from "@/lib/shop-timezone";
import { adjustBankBalanceAction, createBankAccountAction, updateBankAccountAction } from "./actions";
import { BankTransferForm } from "./_transfer-form";

export const dynamic = "force-dynamic";
type Query = { error?: string; created?: string; updated?: string; adjusted?: string; transferred?: string; transfer?: string; account?: string; direction?: string; status?: string; type?: string; source?: string; q?: string; from?: string; to?: string };

type PageProps = { searchParams: Promise<Query> };
function movementTime(date: Date, timeZone: string) { return new Intl.DateTimeFormat("ar", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", timeZone }).format(date); }

export default async function BankAccountsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const auth = await requirePermission("reports:read");
  const canManageBank = can(auth, "expenses:manage");
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const accounts = await bankAccountService.listAccounts(auth.shop.id, { includeInactive:true });
  const wallets = await financialTransferService.listWallets(auth.shop.id);
  const filters = {
    accountId: params.account || undefined,
    direction: params.direction === "IN" || params.direction === "OUT" ? params.direction as BankMovementDirection : undefined,
    status: params.status === "ACTIVE" || params.status === "VOID" ? params.status as BankMovementStatus : undefined,
    type: params.type || undefined,
    sourceType: params.source || undefined,
    q: params.q || undefined,
    from: params.from ? dateInputStartUtcForTimeZone(params.from, timeZone) : undefined,
    to: params.to ? dateInputEndUtcForTimeZone(params.to, timeZone) : undefined,
  };
  const movements = await bankAccountService.listMovements(auth.shop.id, filters, 250);
  const currency = auth.shop.currency || "SAR";
  const active = accounts.filter((account) => account.isActive);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
  const success = params.transferred ? "تم نقل السيولة وتسجيل الحركة على الطرفين." : params.created ? "تمت إضافة الحساب البنكي وتسجيل رصيده الافتتاحي." : params.updated ? "تم تحديث الحساب البنكي." : params.adjusted ? "تمت تسوية رصيد الحساب وتسجيل الحركة." : null;
  const movementTypes = [...new Set(movements.map((movement) => movement.type))].sort();
  const sourceTypes = [...new Set(movements.map((movement) => movement.sourceType))].sort();

  return <div className="space-y-6">
    <PageHeader eyebrow="المالية • الحسابات البنكية" title="الحسابات البنكية" description="أرصدة البنك وسجل تدقيق كامل لكل مبلغ دخل أو خرج، مع المصدر والرصيد قبل وبعد الحركة ومن نفذها." />
    {params.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{params.error}</div> : null}
    {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div> : null}

    <section className="grid gap-4 sm:grid-cols-3">
      <Stat icon={<Landmark className="h-5 w-5" />} title="إجمالي أرصدة البنوك" value={formatCurrency(totalBalance,currency)} helper="سيولة حالية وليست أرباحاً." />
      <Stat icon={<Building2 className="h-5 w-5" />} title="الحسابات النشطة" value={String(active.length)} helper={`من أصل ${accounts.length} حساب.`} />
      <Stat icon={<Settings2 className="h-5 w-5" />} title="الحركات المطابقة" value={String(movements.length)} helper="حسب الفلاتر الحالية." />
    </section>

    {canManageBank ? <section className="grid gap-5 xl:grid-cols-2">
      <form action={createBankAccountAction} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Plus className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">إضافة حساب بنكي</h2><p className="mt-1 text-sm font-semibold text-slate-400">الرصيد الافتتاحي لا يدخل في الأرباح.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold text-slate-700">اسم الحساب<input name="name" required maxLength={120} className="erp-input" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">اسم البنك<input name="bankName" maxLength={120} className="erp-input" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700 sm:col-span-2">الرصيد الافتتاحي<input name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" required className="erp-input font-numeric" /></label></div><Button type="submit" className="mt-4 h-11 w-full rounded-xl font-black">إضافة الحساب</Button>
      </form>
      <BankTransferForm accounts={active.map((a)=>({ id:a.id,name:a.name,bankName:a.bankName,balance:Number(a.currentBalance) }))} wallets={wallets.map((w)=>({ id:w.id,name:w.name,balance:Number(w.currentBalance) }))} currency={currency} />
    </section> : <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">عرض للقراءة فقط. تعديل الحسابات والتسويات والتحويلات يتطلب صلاحية إدارة المصروفات.</div>}

    {canManageBank ? <form action={adjustBankBalanceAction} className="rounded-[22px] border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white p-5 shadow-sm">
      <div className="mb-4"><h2 className="font-black text-slate-900">تسوية رصيد يدوية</h2><p className="mt-1 text-sm font-semibold text-slate-400">للتصحيح أو حركة خارج العمليات الآلية؛ لا تستعملها بدل البيع أو المصروف أو التحويل الداخلي.</p></div>
      {active.length ? <div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1.5 text-sm font-bold text-slate-700">الحساب<select name="accountId" required defaultValue="" className="erp-input"><option value="" disabled>اختر الحساب</option>{active.map((a)=><option key={a.id} value={a.id}>{a.name} — {formatCurrency(Number(a.currentBalance),currency)}</option>)}</select></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">النوع<select name="direction" defaultValue="IN" className="erp-input"><option value="IN">زيادة الرصيد</option><option value="OUT">خفض الرصيد</option></select></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">المبلغ<input name="amount" type="number" min="0.01" step="0.01" required className="erp-input font-numeric" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700 md:col-span-2">سبب التسوية<input name="reason" required maxLength={500} className="erp-input" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">تاريخ الحركة<input name="occurredAt" type="date" className="erp-input" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700 md:col-span-2">مرجع<input name="reference" maxLength={120} className="erp-input" /></label><Button type="submit" className="h-11 rounded-xl bg-indigo-700 font-black hover:bg-indigo-800">حفظ التسوية</Button></div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">أضف حساباً بنكياً نشطاً أولاً.</div>}
    </form> : null}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account)=> canManageBank ? <form key={account.id} action={updateBankAccountAction} className={`rounded-[22px] border p-5 shadow-sm ${account.isActive?"border-emerald-100 bg-white":"border-slate-200 bg-slate-50 opacity-75"}`}><input type="hidden" name="accountId" value={account.id}/><div className="mb-4 flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-slate-400">{account.bankName||"حساب بنكي"}</div><div className="mt-1 font-numeric text-xl font-black text-slate-900">{formatCurrency(Number(account.currentBalance),currency)}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${account.isActive?"bg-emerald-50 text-emerald-700":"bg-slate-200 text-slate-600"}`}>{account.isActive?"نشط":"متوقف"}</span></div><div className="grid gap-2"><input name="name" defaultValue={account.name} required maxLength={120} className="erp-input"/><input name="bankName" defaultValue={account.bankName??""} maxLength={120} className="erp-input"/><select name="isActive" defaultValue={account.isActive?"1":"0"} className="erp-input"><option value="1">نشط</option><option value="0">متوقف</option></select></div><div className="mt-3 text-[11px] font-semibold text-slate-400">الافتتاحي: {formatCurrency(Number(account.openingBalance),currency)}</div><Button type="submit" variant="outline" className="mt-4 h-10 w-full rounded-xl font-black">حفظ بيانات الحساب</Button></form> : <div key={account.id} className={`rounded-[22px] border p-5 shadow-sm ${account.isActive?"border-emerald-100 bg-white":"border-slate-200 bg-slate-50 opacity-75"}`}><div className="text-xs font-bold text-slate-400">{account.bankName||"حساب بنكي"}</div><div className="mt-1 text-sm font-black text-slate-800">{account.name}</div><div className="mt-3 font-numeric text-xl font-black text-slate-900">{formatCurrency(Number(account.currentBalance),currency)}</div><div className="mt-2 text-[11px] font-semibold text-slate-400">الافتتاحي: {formatCurrency(Number(account.openingBalance),currency)} • {account.isActive?"نشط":"متوقف"}</div></div>)}</section>

    <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"><form className="grid gap-2 md:grid-cols-4 xl:grid-cols-8"><input name="q" defaultValue={params.q||""} className="erp-input md:col-span-2" placeholder="بحث بالمرجع أو العميل أو البيان"/><select name="account" defaultValue={params.account||""} className="erp-input"><option value="">كل الحسابات</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</select><select name="direction" defaultValue={params.direction||""} className="erp-input"><option value="">دخل/خرج</option><option value="IN">دخول</option><option value="OUT">خروج</option></select><select name="status" defaultValue={params.status||""} className="erp-input"><option value="">كل الحالات</option><option value="ACTIVE">فعالة</option><option value="VOID">ملغاة</option></select><select name="type" defaultValue={params.type||""} className="erp-input"><option value="">كل أنواع الحركة</option>{movementTypes.map((t)=><option key={t} value={t}>{bankMovementLabel(t)}</option>)}</select><select name="source" defaultValue={params.source||""} className="erp-input"><option value="">كل المصادر</option>{sourceTypes.map((s)=><option key={s} value={s}>{bankSourceLabel(s)}</option>)}</select><div className="grid grid-cols-2 gap-2"><input name="from" type="date" defaultValue={params.from||""} className="erp-input"/><input name="to" type="date" defaultValue={params.to||""} className="erp-input"/></div><Button type="submit" variant="outline" className="h-11 rounded-xl font-black">تطبيق</Button></form></section>

    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-900">سجل حركات الحسابات البنكية</h2><p className="mt-1 text-sm font-semibold text-slate-400">الرصيد قبل وبعد كل حركة محسوب حسب ترتيب الحركات زمنياً، والحركات الملغاة تبقى ظاهرة للتدقيق.</p></div>{movements.length?<div className="overflow-x-auto"><table className="erp-table min-w-[1200px]"><thead><tr><th>الحساب</th><th>الحركة والمصدر</th><th>الطرف</th><th>المبلغ</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>منفذها</th><th>الحالة</th><th>وقت الحركة</th><th></th></tr></thead><tbody>{movements.map((m)=><tr key={m.id} className={m.status==="VOID"?"opacity-55":""}><td><div className="font-black text-slate-800">{m.accountName}</div><div className="text-xs text-slate-400">{m.bankName||"—"}</div></td><td><div className="font-black text-slate-700">{bankMovementLabel(m.type)}</div><div className="text-xs text-slate-400">{bankSourceLabel(m.sourceType)}{m.sourceReference?` — ${m.sourceReference}`:""}</div><div className="max-w-[260px] truncate text-[10px] text-slate-400">{m.description||"—"}</div></td><td className="text-xs font-bold text-slate-600">{m.customerName||m.counterpartyName||"—"}</td><td><span className={`inline-flex items-center gap-1 font-numeric font-black ${m.direction==="IN"?"text-emerald-700":"text-rose-700"}`}>{m.direction==="IN"?<ArrowDownLeft className="h-4 w-4"/>:<ArrowUpRight className="h-4 w-4"/>}{m.direction==="IN"?"+":"−"}{formatCurrency(Number(m.amount),currency)}</span></td><td className="font-numeric text-xs font-bold">{formatCurrency(Number(m.balanceBefore),currency)}</td><td className="font-numeric text-xs font-black">{formatCurrency(Number(m.balanceAfter),currency)}</td><td className="text-xs font-bold">{m.createdByName||"غير معروف"}</td><td><span className={`rounded-full px-2 py-1 text-[10px] font-black ${m.status==="ACTIVE"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{m.status==="ACTIVE"?"فعالة":"ملغاة"}</span></td><td className="text-xs font-semibold text-slate-500">{movementTime(m.occurredAt,timeZone)}</td><td><Link href={`/bank-accounts/movements/${m.id}`} className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:underline"><ExternalLink className="h-3.5 w-3.5"/>تفاصيل</Link></td></tr>)}</tbody></table></div>:<div className="p-10 text-center text-sm font-bold text-slate-400">لا توجد حركات مطابقة.</div>}</section>
  </div>;
}
function Stat({ icon,title,value,helper }:{ icon:ReactNode; title:string; value:string; helper:string }) { return <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-slate-600">{icon}<span className="text-xs font-black">{title}</span></div><div className="mt-3 font-numeric text-2xl font-black text-slate-900">{value}</div><p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p></div>; }
