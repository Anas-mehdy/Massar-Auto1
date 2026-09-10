import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ExternalLink,
  Landmark,
  PencilLine,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { can, requirePermission } from "@/lib/auth/context";
import { formatCurrency } from "@/lib/format";
import { cashDrawerMovementLabel, cashDrawerSourceHref, cashDrawerSourceLinkLabel } from "@/lib/cash-drawer-presentation";
import { cashDrawerService, type CashDrawerMovementRow } from "@/lib/services/cashDrawerService";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { timeZoneForCountry } from "@/lib/shop-timezone";
import { addCashMovementAction, setOpeningBalanceAction, updateOpeningBalanceAction } from "./actions";
import { CashLiquidityTransferForm } from "./_liquidity-transfer-form";

export const dynamic = "force-dynamic";
type CashDrawerPageProps = { searchParams: Promise<{ error?: string; openingSaved?: string; openingUpdated?: string; movementSaved?: string; transferSaved?: string }> };

function formatMovementTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ar", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}
function movementTone(movement: CashDrawerMovementRow) {
  if (movement.status === "VOID") return "border-slate-200 bg-slate-50 text-slate-500";
  return movement.direction === "IN" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-rose-100 bg-rose-50 text-rose-700";
}

export default async function CashDrawerPage({ searchParams }: CashDrawerPageProps) {
  const params = await searchParams;
  const auth = await requirePermission("sales:create");
  const canManageBankAccounts = can(auth, "expenses:manage");
  const [wallets, drawer, bankAccounts] = await Promise.all([
    financialTransferService.listWallets(auth.shop.id),
    cashDrawerService.getAuditSnapshot(auth.shop.id, 150),
    canManageBankAccounts ? bankAccountService.listAccounts(auth.shop.id) : Promise.resolve([]),
  ]);
  const currency = auth.shop.currency || "SAR";
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const successText = params.openingUpdated ? "تم تعديل الرصيد الافتتاحي وتحديث رصيد الدرج بمقدار الفرق." : params.openingSaved ? "تم تسجيل الرصيد الافتتاحي للدرج." : params.movementSaved ? "تم تسجيل حركة الدرج وتحديث الرصيد." : params.transferSaved ? "تم تحويل السيولة بنجاح." : null;

  return <div className="space-y-6">
    <PageHeader eyebrow="المالية • السيولة النقدية" title="الدرج النقدي" description="رصيد الكاش الفعلي وسجل كامل لكل مبلغ دخل إلى الدرج أو خرج منه، مع ربط الحركة بمصدرها الأصلي." />
    {params.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{params.error}</div>}
    {successText && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{successText}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="الرصيد الحالي" value={formatCurrency(drawer.currentBalance, currency)} helper="المبلغ النقدي المتوفر الآن" icon={Banknote} tone="teal" />
      <StatCard label="الرصيد الافتتاحي" value={formatCurrency(drawer.openingBalance, currency)} helper="لا يُحسب كمبيعات أو أرباح" icon={Landmark} tone="slate" />
      <StatCard label="دخل اليوم" value={formatCurrency(drawer.todayIn, currency)} helper="دون الرصيد الافتتاحي" icon={ArrowDownLeft} tone="emerald" />
      <StatCard label="خرج اليوم" value={formatCurrency(drawer.todayOut, currency)} helper="سحب، باقي أو تحويل" icon={ArrowUpRight} tone="rose" />
    </section>

    {!drawer.openingBalanceSetAt && <section className="overflow-hidden rounded-[22px] border border-amber-200 bg-gradient-to-l from-amber-50 via-white to-orange-50 shadow-sm"><div className="border-b border-amber-100 px-5 py-4"><h2 className="text-base font-black text-slate-900">ابدأ برصيد الدرج الحالي</h2><p className="mt-1 text-sm font-semibold text-slate-500">سجّل الكاش الموجود فعلياً قبل بدء استخدام الدرج. هذه القيمة لا تدخل في الأرباح.</p></div><form action={setOpeningBalanceAction} className="grid gap-3 p-5 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end"><label className="grid gap-1.5 text-sm font-bold text-slate-700">الرصيد الافتتاحي<input name="amount" type="number" min="0" step="0.01" required className="erp-input font-numeric" placeholder="0.00" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">ملاحظة<input name="notes" className="erp-input" placeholder="مثال: كاش موجود قبل استخدام مسار" /></label><Button type="submit" className="h-12 rounded-xl px-6 font-black">تسجيل الرصيد</Button></form></section>}

    {drawer.openingBalanceSetAt && <section className="overflow-hidden rounded-[22px] border border-indigo-100 bg-gradient-to-l from-indigo-50/80 via-white to-cyan-50/50 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100/80 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><PencilLine className="h-5 w-5" /></span><div><h2 className="text-base font-black text-slate-900">تعديل الرصيد الافتتاحي</h2><p className="mt-1 text-sm font-semibold text-slate-500">صحّح الرقم إذا تم إدخاله بالخطأ. لا يُسجل التعديل كدخل أو ربح.</p></div></div><span className="rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-black text-indigo-700">الحالي: {formatCurrency(drawer.openingBalance, currency)}</span></div><form action={updateOpeningBalanceAction} className="grid gap-3 p-5 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end"><label className="grid gap-1.5 text-sm font-bold text-slate-700">الرصيد الافتتاحي الجديد<input name="amount" type="number" min="0" step="0.01" required defaultValue={drawer.openingBalance.toFixed(2)} className="erp-input font-numeric" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">سبب التعديل <span className="font-semibold text-slate-400">(اختياري)</span><input name="notes" className="erp-input" placeholder="مثال: تصحيح الرصيد الذي تم إدخاله أول مرة" /></label><Button type="submit" className="h-12 rounded-xl bg-indigo-700 px-6 font-black hover:bg-indigo-800">حفظ التعديل</Button></form><div className="border-t border-indigo-100/80 bg-white/60 px-5 py-3 text-xs font-semibold leading-6 text-slate-500">يتم تعديل الرصيد الحالي بمقدار الفرق فقط. مثال: تغيير الافتتاحي من 5,000 إلى 5,500 يزيد رصيد الدرج الحالي 500 فقط.</div></section>}

    <section className="grid gap-5 xl:grid-cols-2">
      <form action={addCashMovementAction} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Plus className="h-5 w-5" /></span><div><h2 className="text-base font-black text-slate-900">حركة نقدية يدوية</h2><p className="mt-0.5 text-sm font-semibold text-slate-400">إضافة أو سحب كاش لسبب خارج عمليات البيع والتحصيل الآلية.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold text-slate-700">نوع الحركة<select name="direction" className="erp-input" defaultValue="IN"><option value="IN">إضافة إلى الدرج</option><option value="OUT">سحب من الدرج</option></select></label><label className="grid gap-1.5 text-sm font-bold text-slate-700">المبلغ<input name="amount" type="number" min="0.01" step="0.01" required className="erp-input font-numeric" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700 sm:col-span-2">سبب الحركة<input name="description" required className="erp-input" placeholder="مثال: سحب المالك أو إضافة تمويل نقدي" /></label><label className="grid gap-1.5 text-sm font-bold text-slate-700 sm:col-span-2">مرجع اختياري<input name="reference" className="erp-input" placeholder="رقم إيصال أو ملاحظة مرجعية" /></label></div><Button type="submit" className="mt-4 h-11 w-full rounded-xl font-black">حفظ الحركة</Button></form>

      <CashLiquidityTransferForm
        wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance) }))}
        bankAccounts={bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, balance: Number(account.currentBalance) }))}
        currency={currency}
        canManageBank={canManageBankAccounts}
      />
    </section>

    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="text-base font-black text-slate-900">سجل حركات الدرج</h2><p className="mt-1 text-sm font-semibold text-slate-400">آخر {drawer.movements.length} حركة، بما فيها الحركات الملغاة لأغراض التدقيق.</p></div><span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700">الرصيد {formatCurrency(drawer.currentBalance, currency)}</span></div>
      {drawer.movements.length === 0 ? <div className="p-12 text-center"><Banknote className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-400">لا توجد حركات في الدرج حتى الآن.</p></div> : <><div className="hidden overflow-x-auto md:block"><table className="erp-table min-w-[1050px]"><thead><tr><th>الحركة</th><th>المصدر / المرجع</th><th>العميل</th><th>المبلغ</th><th>المحفظة</th><th>الحالة</th><th>التاريخ والوقت</th><th>الإجراء</th></tr></thead><tbody>{drawer.movements.map((movement) => <MovementTableRow key={movement.id} movement={movement} currency={currency} timeZone={timeZone} />)}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden">{drawer.movements.map((movement) => <MovementMobileCard key={movement.id} movement={movement} currency={currency} timeZone={timeZone} />)}</div></>}
    </section>
  </div>;
}

function MovementTableRow({ movement, currency, timeZone }: { movement: CashDrawerMovementRow; currency: string; timeZone: string }) {
  const sourceHref = cashDrawerSourceHref(movement);
  return <tr className={movement.status === "VOID" ? "opacity-60" : ""}><td><div className="font-black text-slate-800">{cashDrawerMovementLabel(movement)}</div><div className="mt-1 max-w-[220px] truncate text-xs font-semibold text-slate-400">{movement.description || "—"}</div></td><td><div className="font-bold text-slate-700">{movement.sourceReference || movement.reference || "—"}</div>{sourceHref && <Link href={sourceHref} className="mt-1 inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:text-teal-800"><ExternalLink className="h-3 w-3" />{cashDrawerSourceLinkLabel(movement.sourceType)}</Link>}</td><td>{movement.customerName ? <div><p className="font-bold text-slate-700">{movement.customerName}</p>{movement.customerPhone && <p className="mt-0.5 text-xs text-slate-400">{movement.customerPhone}</p>}</div> : "—"}</td><td><span className={`font-numeric text-sm font-black ${movement.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>{movement.direction === "IN" ? "+" : "-"}{formatCurrency(Number(movement.amount), currency)}</span></td><td>{movement.walletName || "—"}</td><td><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${movementTone(movement)}`}>{movement.status === "VOID" ? "ملغاة" : "فعالة"}</span></td><td className="whitespace-nowrap text-xs font-bold text-slate-500">{formatMovementTime(movement.createdAt, timeZone)}</td><td><Button asChild size="sm" variant="outline" className="rounded-lg"><Link href={`/cash-drawer/${movement.id}`}>فتح التفاصيل</Link></Button></td></tr>;
}
function MovementMobileCard({ movement, currency, timeZone }: { movement: CashDrawerMovementRow; currency: string; timeZone: string }) {
  const sourceHref = cashDrawerSourceHref(movement);
  return <article className={`p-4 ${movement.status === "VOID" ? "bg-slate-50/70 opacity-70" : ""}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">{cashDrawerMovementLabel(movement)}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{movement.description || movement.sourceReference || "حركة درج نقدي"}</p></div><span className={`font-numeric text-base font-black ${movement.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>{movement.direction === "IN" ? "+" : "-"}{formatCurrency(Number(movement.amount), currency)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-2.5"><span className="block font-semibold text-slate-400">المرجع</span><span className="mt-1 block truncate font-bold text-slate-700">{movement.sourceReference || movement.reference || "—"}</span></div><div className="rounded-xl bg-slate-50 p-2.5"><span className="block font-semibold text-slate-400">الوقت</span><span className="mt-1 block font-bold text-slate-700">{formatMovementTime(movement.createdAt, timeZone)}</span></div></div>{movement.customerName && <p className="mt-3 text-xs font-bold text-slate-600">العميل: {movement.customerName}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="rounded-lg"><Link href={`/cash-drawer/${movement.id}`}>فتح التفاصيل</Link></Button>{sourceHref && <Button asChild size="sm" variant="outline" className="rounded-lg border-teal-200 text-teal-700"><Link href={sourceHref}><ExternalLink className="ml-1 h-3.5 w-3.5" />{cashDrawerSourceLinkLabel(movement.sourceType)}</Link></Button>}</div></article>;
}

type StatTone = "teal" | "emerald" | "rose" | "slate";
const statTone: Record<StatTone, string> = { teal: "border-teal-100 bg-teal-50 text-teal-700", emerald: "border-emerald-100 bg-emerald-50 text-emerald-700", rose: "border-rose-100 bg-rose-50 text-rose-700", slate: "border-slate-200 bg-slate-100 text-slate-700" };
function StatCard({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: LucideIcon; tone: StatTone }) { return <div className={`rounded-[20px] border p-5 shadow-sm ${statTone[tone]}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black opacity-80">{label}</p><p className="mt-2 font-numeric text-2xl font-black text-slate-900">{value}</p><p className="mt-2 text-xs font-semibold opacity-70">{helper}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm"><Icon className="h-5 w-5" /></span></div></div>; }
