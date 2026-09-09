"use client";

import { Banknote, Loader2, PackageCheck, RotateCcw, Scale } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  recordPurchasePaymentAction,
  recordPurchaseReceiptAction,
  recordSupplierReturnAction,
  settleSupplierReturnAction,
} from "./actions";

type ItemRow = {
  id: string;
  name: string;
  orderedQuantity: number;
  receivedQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  returnableQuantity: number;
  unitCost: string;
};

type SupplierReturnRow = {
  id: string;
  reason: string;
  totalValue: string;
  remainingSettlementValue: string;
  returnedAt: string;
};

type WalletRow = { id: string; name: string; currentBalance: string };
type BankRow = { id: string; name: string; bankName: string | null; currentBalance: string };
type PaymentSourceRow = { id: string; name: string };
type AccountType = "DRAWER" | "WALLET" | "BANK" | "OTHER";
type PaymentMethodValue = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
type SettlementType = "PAYABLE_REDUCTION" | "SUPPLIER_CREDIT" | "REFUND";

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function today() { return new Date().toISOString().slice(0, 10); }
function numberValue(value: string) { const n = Number(value.replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function formatMoney(value: number | string, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export function PurchaseOperationsPanel({
  purchaseId,
  currency,
  balanceDue,
  items,
  supplierReturns,
  wallets,
  bankAccounts,
  paymentSources,
}: {
  purchaseId: string;
  currency: string;
  balanceDue: string;
  items: ItemRow[];
  supplierReturns: SupplierReturnRow[];
  wallets: WalletRow[];
  bankAccounts: BankRow[];
  paymentSources: PaymentSourceRow[];
}) {
  const router = useRouter();
  const receiptItems = useMemo(() => items.filter((item) => item.remainingQuantity > 0), [items]);
  const returnItems = useMemo(() => items.filter((item) => item.returnableQuantity > 0), [items]);
  const openReturns = useMemo(() => supplierReturns.filter((item) => numberValue(item.remainingSettlementValue) > 0.009), [supplierReturns]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [receiptDate, setReceiptDate] = useState(today());
  const [receiptReference, setReceiptReference] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptKey = useRef<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("CASH");
  const [paymentAccount, setPaymentAccount] = useState<AccountType>("DRAWER");
  const [paymentWalletId, setPaymentWalletId] = useState("");
  const [paymentBankAccountId, setPaymentBankAccountId] = useState("");
  const [paymentSourceName, setPaymentSourceName] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentBusy, setPaymentBusy] = useState(false);
  const paymentKey = useRef<string | null>(null);

  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnReference, setReturnReference] = useState("");
  const [returnDate, setReturnDate] = useState(today());
  const [returnBusy, setReturnBusy] = useState(false);
  const returnKey = useRef<string | null>(null);

  const [selectedReturnId, setSelectedReturnId] = useState(openReturns[0]?.id ?? "");
  const selectedReturn = openReturns.find((item) => item.id === selectedReturnId) ?? null;
  const [settlementType, setSettlementType] = useState<SettlementType>("PAYABLE_REDUCTION");
  const [settlementAmount, setSettlementAmount] = useState(selectedReturn?.remainingSettlementValue ?? "");
  const [settlementAccount, setSettlementAccount] = useState<AccountType>("DRAWER");
  const [settlementWalletId, setSettlementWalletId] = useState("");
  const [settlementBankAccountId, setSettlementBankAccountId] = useState("");
  const [settlementSourceName, setSettlementSourceName] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const [settlementDate, setSettlementDate] = useState(today());
  const [settlementBusy, setSettlementBusy] = useState(false);
  const settlementKey = useRef<string | null>(null);

  useEffect(() => {
    if (openReturns.length === 0) {
      setSelectedReturnId("");
      setSettlementAmount("");
      return;
    }
    if (!openReturns.some((item) => item.id === selectedReturnId)) {
      setSelectedReturnId(openReturns[0].id);
      setSettlementAmount(openReturns[0].remainingSettlementValue);
    }
  }, [openReturns, selectedReturnId]);

  function clearFeedback() { setMessage(""); setError(""); }
  function fillRemainingReceipt() {
    setReceiptQuantities(Object.fromEntries(receiptItems.map((item) => [item.id, String(item.remainingQuantity)])));
  }

  async function submitReceipt() {
    clearFeedback();
    const lines = receiptItems.map((item) => ({ purchaseItemId: item.id, quantity: Number(receiptQuantities[item.id] || 0) })).filter((line) => line.quantity > 0);
    if (!lines.length) { setError("أدخل كمية واحدة على الأقل للاستلام."); return; }
    if (lines.some((line) => !Number.isInteger(line.quantity))) { setError("كمية الاستلام يجب أن تكون عدداً صحيحاً."); return; }
    receiptKey.current ??= requestKey();
    setReceiptBusy(true);
    try {
      const result = await recordPurchaseReceiptAction({ purchaseId, requestKey: receiptKey.current, receivedAt: receiptDate, reference: receiptReference || null, note: receiptNote || null, lines });
      if (!result.ok) { receiptKey.current = null; setError("error" in result ? result.error : "تعذر تسجيل الاستلام."); return; }
      receiptKey.current = null;
      setReceiptQuantities({}); setReceiptReference(""); setReceiptNote("");
      setMessage(result.alreadyApplied ? "هذه المحاولة كانت مسجلة مسبقاً؛ لم تُكرر الكميات." : "تم تسجيل الاستلام وربطه بالفاتورة.");
      router.refresh();
    } catch {
      setError("تعذر تأكيد نتيجة الطلب. أعد المحاولة؛ سيُستخدم نفس مفتاح العملية لمنع التكرار.");
    } finally { setReceiptBusy(false); }
  }

  async function submitPayment() {
    clearFeedback();
    const amount = numberValue(paymentAmount);
    if (amount <= 0 || amount > numberValue(balanceDue) + 0.009) { setError("أدخل دفعة أكبر من صفر ولا تتجاوز المتبقي."); return; }
    if (paymentAccount === "WALLET" && !paymentWalletId) { setError("اختر المحفظة التي خرجت منها الدفعة."); return; }
    if (paymentAccount === "BANK" && !paymentBankAccountId) { setError("اختر الحساب البنكي الذي خرجت منه الدفعة."); return; }
    if (paymentAccount === "OTHER" && !paymentSourceName.trim()) { setError("اكتب مصدر الدفع الخارجي حتى يبقى السجل واضحاً."); return; }
    paymentKey.current ??= requestKey();
    setPaymentBusy(true);
    try {
      const result = await recordPurchasePaymentAction({
        purchaseId, requestKey: paymentKey.current, amount: paymentAmount, method: paymentMethod,
        sourceName: paymentAccount === "OTHER" ? (paymentSourceName || null) : paymentAccount === "WALLET" ? (wallets.find((w) => w.id === paymentWalletId)?.name ?? null) : paymentAccount === "BANK" ? (bankAccounts.find((a) => a.id === paymentBankAccountId)?.name ?? null) : "الدرج النقدي",
        reference: paymentReference || null, paidAt: paymentDate, accountType: paymentAccount, walletId: paymentAccount === "WALLET" ? paymentWalletId || null : null, bankAccountId: paymentAccount === "BANK" ? paymentBankAccountId || null : null,
      });
      if (!result.ok) { paymentKey.current = null; setError("error" in result ? result.error : "تعذر تسجيل الدفعة."); return; }
      paymentKey.current = null;
      setPaymentAmount(""); setPaymentReference("");
      setMessage(result.alreadyApplied ? "الدفعة كانت مسجلة مسبقاً؛ لم يتكرر أثرها المالي." : "تم تسجيل الدفعة وتحديث مستحق الفاتورة.");
      router.refresh();
    } catch {
      setError("تعذر تأكيد نتيجة الدفعة. أعد المحاولة؛ سيُستخدم نفس مفتاح العملية لمنع التكرار.");
    } finally { setPaymentBusy(false); }
  }

  async function submitReturn() {
    clearFeedback();
    const lines = returnItems.map((item) => ({ purchaseItemId: item.id, quantity: Number(returnQuantities[item.id] || 0) })).filter((line) => line.quantity > 0);
    if (!lines.length) { setError("حدد كمية واحدة على الأقل للإرجاع."); return; }
    if (lines.some((line) => !Number.isInteger(line.quantity))) { setError("كمية المرتجع يجب أن تكون عدداً صحيحاً."); return; }
    if (!returnReason.trim()) { setError("سبب المرتجع مطلوب."); return; }
    returnKey.current ??= requestKey();
    setReturnBusy(true);
    try {
      const result = await recordSupplierReturnAction({ purchaseId, requestKey: returnKey.current, reason: returnReason, reference: returnReference || null, returnedAt: returnDate, lines });
      if (!result.ok) { returnKey.current = null; setError("error" in result ? result.error : "تعذر تسجيل المرتجع."); return; }
      returnKey.current = null;
      setReturnQuantities({}); setReturnReason(""); setReturnReference("");
      setMessage(result.alreadyApplied ? "المرتجع كان مسجلاً مسبقاً؛ لم تتكرر حركة المخزون." : "تم إرجاع البضاعة للمورد. لم تُسجل أي تسوية مالية تلقائياً.");
      router.refresh();
    } catch {
      setError("تعذر تأكيد نتيجة المرتجع. أعد المحاولة؛ سيُستخدم نفس مفتاح العملية لمنع التكرار.");
    } finally { setReturnBusy(false); }
  }

  async function submitSettlement() {
    clearFeedback();
    if (!selectedReturn) { setError("اختر مرتجعاً له قيمة غير مسواة."); return; }
    const amount = numberValue(settlementAmount);
    if (amount <= 0 || amount > numberValue(selectedReturn.remainingSettlementValue) + 0.009) { setError("قيمة التسوية يجب ألا تتجاوز المتبقي على المرتجع."); return; }
    if (settlementType === "PAYABLE_REDUCTION" && amount > numberValue(balanceDue) + 0.009) { setError("الخصم من المستحق لا يمكن أن يتجاوز رصيد الفاتورة الحالي. استخدم رصيد المورد أو استرداداً للمبلغ الزائد."); return; }
    if (settlementType === "REFUND" && settlementAccount === "WALLET" && !settlementWalletId) { setError("اختر المحفظة التي وصل إليها المبلغ المسترد."); return; }
    if (settlementType === "REFUND" && settlementAccount === "BANK" && !settlementBankAccountId) { setError("اختر الحساب البنكي الذي وصل إليه المبلغ المسترد."); return; }
    if (settlementType === "REFUND" && settlementAccount === "OTHER" && !settlementSourceName.trim()) { setError("اكتب مصدر الاسترداد الخارجي حتى يبقى السجل واضحاً."); return; }
    settlementKey.current ??= requestKey();
    setSettlementBusy(true);
    try {
      const result = await settleSupplierReturnAction({
        purchaseId, supplierReturnId: selectedReturn.id, requestKey: settlementKey.current, type: settlementType, amount: settlementAmount,
        settledAt: settlementDate,
        accountType: settlementType === "REFUND" ? settlementAccount : null,
        walletId: settlementType === "REFUND" && settlementAccount === "WALLET" ? settlementWalletId || null : null,
        bankAccountId: settlementType === "REFUND" && settlementAccount === "BANK" ? settlementBankAccountId || null : null,
        sourceName: settlementType === "REFUND" ? (settlementAccount === "WALLET" ? wallets.find((w) => w.id === settlementWalletId)?.name ?? null : settlementAccount === "DRAWER" ? "الدرج النقدي" : settlementSourceName || null) : null,
        reference: settlementReference || null,
      });
      if (!result.ok) { settlementKey.current = null; setError("error" in result ? result.error : "تعذر تسجيل التسوية."); return; }
      settlementKey.current = null;
      setSettlementReference("");
      setMessage(result.alreadyApplied ? "التسوية كانت مسجلة مسبقاً؛ لم يتكرر أثرها." : settlementType === "PAYABLE_REDUCTION" ? "تم خصم التسوية من مستحق الفاتورة." : settlementType === "SUPPLIER_CREDIT" ? "تم تسجيل القيمة كرَصيد لدى المورد دون حركة نقدية." : "تم تسجيل المبلغ المسترد في المصدر المالي المحدد.");
      router.refresh();
    } catch {
      setError("تعذر تأكيد نتيجة التسوية. أعد المحاولة؛ سيُستخدم نفس مفتاح العملية لمنع التكرار.");
    } finally { setSettlementBusy(false); }
  }

  return <section className="space-y-4">
    <div><h2 className="text-lg font-black text-slate-900 dark:text-slate-100">عمليات ما بعد الاعتماد</h2><p className="mt-1 text-xs font-semibold leading-6 text-slate-500 dark:text-slate-400">الاستلام، الدفع، والمرتجع عمليات مستقلة. إرجاع البضاعة وحده لا يعيد مالاً إلى الدرج ولا يغيّر المستحق حتى تختار تسوية مالية.</p></div>
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}

    <div className="grid gap-4 xl:grid-cols-2">
      <OperationCard icon={PackageCheck} title="استلام كمية إضافية" description={receiptItems.length ? "سجّل ما وصل الآن فقط. لن يسمح مسار بتجاوز الكمية المتبقية." : "كل كميات الفاتورة مستلمة."}>
        {receiptItems.length > 0 && <div className="space-y-3">
          <div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={fillRemainingReceipt}>ملء كل المتبقي</Button></div>
          <div className="max-h-72 space-y-2 overflow-auto">{receiptItems.map((item) => <QuantityRow key={item.id} item={item} max={item.remainingQuantity} value={receiptQuantities[item.id] ?? ""} label="استلام الآن" onChange={(value) => setReceiptQuantities((current) => ({ ...current, [item.id]: value }))} />)}</div>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="تاريخ الاستلام"><input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="erp-input" /></Field><Field label="مرجع الاستلام (اختياري)"><input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} className="erp-input" /></Field></div>
          <Field label="ملاحظة (اختياري)"><input value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} className="erp-input" /></Field>
          <Button type="button" disabled={receiptBusy} onClick={() => void submitReceipt()} className="w-full font-black">{receiptBusy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تسجيل الاستلام</Button>
        </div>}
      </OperationCard>

      <OperationCard icon={Banknote} title="دفعة جديدة للمورد" description={numberValue(balanceDue) > 0.009 ? `المتبقي الحالي ${formatMoney(balanceDue, currency)}` : "الفاتورة مسواة ولا تقبل دفعة إضافية."}>
        {numberValue(balanceDue) > 0.009 && <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2"><Field label="قيمة الدفعة"><input type="number" min="0" step="0.01" max={balanceDue} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="erp-input font-numeric" /></Field><Field label="تاريخ الدفعة"><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="erp-input" /></Field></div>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="طريقة الدفع"><select value={paymentMethod} onChange={(e) => { const method = e.target.value as PaymentMethodValue; setPaymentMethod(method); if (method === "CASH") setPaymentAccount("DRAWER"); }} className="erp-input"><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="OTHER">أخرى</option></select></Field><Field label="الحساب المالي"><select value={paymentAccount} onChange={(e) => { const account = e.target.value as AccountType; setPaymentAccount(account); if (account === "BANK") setPaymentMethod("BANK_TRANSFER"); if (account === "DRAWER") setPaymentMethod("CASH"); }} className="erp-input"><option value="DRAWER">الدرج النقدي</option>{wallets.length > 0 && <option value="WALLET">محفظة مالية</option>}{bankAccounts.length > 0 && <option value="BANK">حساب بنكي</option>}<option value="OTHER">مصدر خارجي — تسجيل فقط</option></select></Field></div>
          {paymentAccount === "WALLET" && <Field label="المحفظة"><select value={paymentWalletId} onChange={(e) => setPaymentWalletId(e.target.value)} className="erp-input"><option value="">اختر المحفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatMoney(wallet.currentBalance, currency)}</option>)}</select></Field>}
          {paymentAccount === "BANK" && <Field label="الحساب البنكي"><select value={paymentBankAccountId} onChange={(e) => setPaymentBankAccountId(e.target.value)} className="erp-input"><option value="">اختر الحساب البنكي</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatMoney(account.currentBalance, currency)}</option>)}</select></Field>}
          {paymentAccount === "OTHER" && <Field label="مصدر الدفع الخارجي"><><input list={`purchase-payment-sources-${purchaseId}`} value={paymentSourceName} onChange={(e) => setPaymentSourceName(e.target.value)} className="erp-input" placeholder="اختر محفوظاً أو اكتب المصدر" /><datalist id={`purchase-payment-sources-${purchaseId}`}>{paymentSources.map((source) => <option key={source.id} value={source.name} />)}</datalist></></Field>}
          <Field label="مرجع الدفع (اختياري)"><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="erp-input" /></Field>
          <Button type="button" disabled={paymentBusy} onClick={() => void submitPayment()} className="w-full font-black">{paymentBusy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تسجيل الدفعة</Button>
        </div>}
      </OperationCard>

      <OperationCard icon={RotateCcw} title="مرتجع إلى المورد" description={returnItems.length ? "الحد الأقصى يأخذ في الاعتبار ما استُلم وما أُرجع والرصيد الحالي." : "لا توجد كمية قابلة للإرجاع حالياً."}>
        {returnItems.length > 0 && <div className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-auto">{returnItems.map((item) => <QuantityRow key={item.id} item={item} max={item.returnableQuantity} value={returnQuantities[item.id] ?? ""} label="إرجاع" onChange={(value) => setReturnQuantities((current) => ({ ...current, [item.id]: value }))} />)}</div>
          <Field label="سبب المرتجع *"><textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="erp-input min-h-20 resize-y" placeholder="مثال: عيب جودة / صنف خاطئ" /></Field>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="تاريخ المرتجع"><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="erp-input" /></Field><Field label="مرجع المورد (اختياري)"><input value={returnReference} onChange={(e) => setReturnReference(e.target.value)} className="erp-input" /></Field></div>
          <Button type="button" disabled={returnBusy} onClick={() => void submitReturn()} className="w-full bg-rose-700 font-black hover:bg-rose-800">{returnBusy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تسجيل المرتجع بدون تسوية مالية</Button>
        </div>}
      </OperationCard>

      <OperationCard icon={Scale} title="تسوية مالية لمرتجع" description={openReturns.length ? "اختر طريقة التسوية بصورة مستقلة عن حركة البضاعة." : "لا توجد قيمة مرتجع غير مسواة."}>
        {openReturns.length > 0 && <div className="space-y-3">
          <Field label="المرتجع"><select value={selectedReturnId} onChange={(e) => { const id = e.target.value; setSelectedReturnId(id); const row = openReturns.find((item) => item.id === id); setSettlementAmount(row?.remainingSettlementValue ?? ""); }} className="erp-input">{openReturns.map((item) => <option key={item.id} value={item.id}>{new Date(item.returnedAt).toLocaleDateString("ar")} — {item.reason} — متبقٍ {formatMoney(item.remainingSettlementValue, currency)}</option>)}</select></Field>
          <Field label="نوع التسوية"><select value={settlementType} onChange={(e) => setSettlementType(e.target.value as SettlementType)} className="erp-input"><option value="PAYABLE_REDUCTION">خصم من مستحق هذه الفاتورة</option><option value="SUPPLIER_CREDIT">رصيد لدى المورد</option><option value="REFUND">مبلغ مسترد فعلياً</option></select></Field>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="القيمة"><input type="number" min="0" step="0.01" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} className="erp-input font-numeric" /></Field><Field label="تاريخ التسوية"><input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} className="erp-input" /></Field></div>
          {settlementType === "REFUND" && <><Field label="وصل المبلغ إلى"><select value={settlementAccount} onChange={(e) => setSettlementAccount(e.target.value as AccountType)} className="erp-input"><option value="DRAWER">الدرج النقدي</option>{wallets.length > 0 && <option value="WALLET">محفظة مالية</option>}{bankAccounts.length > 0 && <option value="BANK">حساب بنكي</option>}<option value="OTHER">مصدر خارجي — تسجيل فقط</option></select></Field>{settlementAccount === "WALLET" && <Field label="المحفظة"><select value={settlementWalletId} onChange={(e) => setSettlementWalletId(e.target.value)} className="erp-input"><option value="">اختر المحفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></Field>}{settlementAccount === "BANK" && <Field label="الحساب البنكي"><select value={settlementBankAccountId} onChange={(e) => setSettlementBankAccountId(e.target.value)} className="erp-input"><option value="">اختر الحساب البنكي</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>}{settlementAccount === "OTHER" && <Field label="المصدر الخارجي"><input value={settlementSourceName} onChange={(e) => setSettlementSourceName(e.target.value)} className="erp-input" placeholder="مثال: حساب خارجي" /></Field>}</>}
          <Field label="مرجع التسوية (اختياري)"><input value={settlementReference} onChange={(e) => setSettlementReference(e.target.value)} className="erp-input" /></Field>
          {settlementType === "SUPPLIER_CREDIT" && <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[11px] font-semibold leading-5 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">سيُسجل كرَصيد لدى المورد دون تحريك الدرج أو المحفظة ودون خفض مستحق هذه الفاتورة. تطبيق هذا الرصيد على فاتورة شراء أخرى ليس ضمن هذه المرحلة.</p>}
          <Button type="button" disabled={settlementBusy} onClick={() => void submitSettlement()} className="w-full font-black">{settlementBusy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تسجيل التسوية</Button>
        </div>}
      </OperationCard>
    </div>
  </section>;
}

function OperationCard({ icon: Icon, title, description, children }: { icon: typeof PackageCheck; title: string; description: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900"><div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span><div><h3 className="font-black text-slate-900 dark:text-slate-100">{title}</h3><p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">{description}</p></div></div>{children}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-xs font-black text-slate-600 dark:text-slate-300"><span>{label}</span>{children}</label>; }
function QuantityRow({ item, max, value, label, onChange }: { item: ItemRow; max: number; value: string; label: string; onChange: (value: string) => void }) {
  return <div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_90px_120px] sm:items-center dark:border-slate-700"><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{item.name}</div><div className="mt-1 text-[10px] font-semibold text-slate-400">فاتورة {item.orderedQuantity} • مستلم {item.receivedQuantity} • مرتجع {item.returnedQuantity}</div></div><div className="text-[10px] font-bold text-slate-500">متاح للعملية <span className="font-numeric font-black text-slate-800 dark:text-slate-100">{max}</span></div><label className="grid gap-1 text-[10px] font-black text-slate-600 dark:text-slate-300">{label}<input type="number" min="0" max={max} step="1" value={value} onChange={(e) => onChange(e.target.value)} className="erp-input h-9 font-numeric" /></label></div>;
}
