from pathlib import Path

ROOT = Path(".")

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

path = "lib/services/supplierLedgerService.ts"
s = read(path)
s = replace_once(s, 'import { requestFingerprint } from "@/lib/idempotency";\nimport { cashDrawerService } from "@/lib/services/cashDrawerService";', 'import { requestFingerprint } from "@/lib/idempotency";\nimport { bankAccountService } from "@/lib/services/bankAccountService";\nimport { cashDrawerService } from "@/lib/services/cashDrawerService";', "supplier service import")
s = replace_once(s, 'export type SupplierPaymentAccountType = "DRAWER" | "WALLET";', 'export type SupplierPaymentAccountType = "DRAWER" | "WALLET" | "BANK";', "supplier payment type")
s = replace_once(s, 'requestKey: string; amount: string | number; occurredAt: string | Date; accountType: SupplierPaymentAccountType; walletId?: string | null; description?: string | null; reference?: string | null;', 'requestKey: string; amount: string | number; occurredAt: string | Date; accountType: SupplierPaymentAccountType; walletId?: string | null; bankAccountId?: string | null; movementOccurredAt?: Date; description?: string | null; reference?: string | null;', "supplier payment input")
s = replace_once(s, '''  const walletId = input.accountType === "WALLET" ? nullableText(input.walletId) : null;
  if (input.accountType === "WALLET" && !walletId) throw new Error("اختر المحفظة التي ستخرج منها الدفعة.");

  let sourceName = "الدرج النقدي";
  if (input.accountType === "DRAWER") {
    // Ensures the runtime-managed CashDrawer tables/row exist before entering the atomic payment transaction.
    await cashDrawerService.getSnapshot(shopId, 1);
  } else {
    // Ensures FinancialWallet / FinancialTransfer are present and validates the wallet belongs to this shop.
    const wallets = await financialTransferService.listWallets(shopId);
    const selectedWallet = wallets.find((wallet) => wallet.id === walletId);
    if (!selectedWallet) throw new Error("المحفظة المحددة غير موجودة أو غير نشطة.");
    sourceName = selectedWallet.name;
  }

  const fingerprint = requestFingerprint({ supplierId, amount: amount.toFixed(2), occurredAt: occurredAt.toISOString(), accountType: input.accountType, walletId, description: nullableText(input.description), reference: nullableText(input.reference) });''', '''  const walletId = input.accountType === "WALLET" ? nullableText(input.walletId) : null;
  const bankAccountId = input.accountType === "BANK" ? nullableText(input.bankAccountId) : null;
  if (input.accountType === "WALLET" && !walletId) throw new Error("اختر المحفظة التي ستخرج منها الدفعة.");
  if (input.accountType === "BANK" && !bankAccountId) throw new Error("اختر الحساب البنكي الذي ستخرج منه الدفعة.");

  let sourceName = "الدرج النقدي";
  if (input.accountType === "DRAWER") {
    await cashDrawerService.getSnapshot(shopId, 1);
  } else if (input.accountType === "WALLET") {
    const wallets = await financialTransferService.listWallets(shopId);
    const selectedWallet = wallets.find((wallet) => wallet.id === walletId);
    if (!selectedWallet) throw new Error("المحفظة المحددة غير موجودة أو غير نشطة.");
    sourceName = selectedWallet.name;
  } else {
    const accounts = await bankAccountService.listAccounts(shopId);
    const selectedBank = accounts.find((account) => account.id === bankAccountId);
    if (!selectedBank) throw new Error("الحساب البنكي المحدد غير موجود أو متوقف.");
    sourceName = selectedBank.name;
  }

  const fingerprint = requestFingerprint({ supplierId, amount: amount.toFixed(2), occurredAt: occurredAt.toISOString(), accountType: input.accountType, walletId, bankAccountId, description: nullableText(input.description), reference: nullableText(input.reference) });''', "supplier preflight")
s = replace_once(s, '''INSERT INTO "SupplierLedgerEntry" ("shopId","supplierId","createdByUserId","type","amount","manualAppliedAmount","occurredAt","description","reference","accountType","sourceName","walletId","requestKey","requestFingerprint")
      VALUES (${shopId}::uuid,${supplierId}::uuid,${userId}::uuid,'PAYMENT',${amount},${manualAppliedAmount},${occurredAt},${nullableText(input.description) ?? `دفعة للمورد ${supplier.name}`},${nullableText(input.reference)},${input.accountType},${sourceName},${walletId}::uuid,${requestKey},${fingerprint}) RETURNING "id"''', '''INSERT INTO "SupplierLedgerEntry" ("shopId","supplierId","createdByUserId","type","amount","manualAppliedAmount","occurredAt","description","reference","accountType","sourceName","walletId","bankAccountId","requestKey","requestFingerprint")
      VALUES (${shopId}::uuid,${supplierId}::uuid,${userId}::uuid,'PAYMENT',${amount},${manualAppliedAmount},${occurredAt},${nullableText(input.description) ?? `دفعة للمورد ${supplier.name}`},${nullableText(input.reference)},${input.accountType},${sourceName},${walletId}::uuid,${bankAccountId}::uuid,${requestKey},${fingerprint}) RETURNING "id"''', "supplier ledger insert")
s = replace_once(s, '''INSERT INTO "PurchasePayment" ("shopId","purchaseInvoiceId","createdByUserId","method","sourceName","amount","reference","note","paidAt","requestKey","requestFingerprint","accountType","walletId")
        VALUES (${shopId}::uuid,${invoice.id}::uuid,${userId}::uuid,${method},${sourceName},${allocation},${nullableText(input.reference)},${`دفعة من كشف حساب المورد [SUPPLIER-LEDGER:${entryId}]`},${occurredAt},${paymentKey},${paymentFingerprint},${input.accountType},${walletId}::uuid)''', '''INSERT INTO "PurchasePayment" ("shopId","purchaseInvoiceId","createdByUserId","method","sourceName","amount","reference","note","paidAt","requestKey","requestFingerprint","accountType","walletId","bankAccountId")
        VALUES (${shopId}::uuid,${invoice.id}::uuid,${userId}::uuid,${method},${sourceName},${allocation},${nullableText(input.reference)},${`دفعة من كشف حساب المورد [SUPPLIER-LEDGER:${entryId}]`},${occurredAt},${paymentKey},${paymentFingerprint},${input.accountType},${walletId}::uuid,${bankAccountId}::uuid)''', "purchase payment bank link")
s = replace_once(s, '''    } else {
      const wallets = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id","name","currentBalance" FROM "FinancialWallet"
        WHERE "id"=${walletId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE FOR UPDATE
      `;''', '''    } else if (input.accountType === "WALLET") {
      const wallets = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id","name","currentBalance" FROM "FinancialWallet"
        WHERE "id"=${walletId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE FOR UPDATE
      `;''', "wallet branch")
s = replace_once(s, '''      await tx.$executeRaw`UPDATE "SupplierLedgerEntry" SET "financialTransferId"=${transferRows[0].id}::uuid, "sourceName"=${wallet.name}, "updatedAt"=NOW() WHERE "id"=${entryId}::uuid`;
    }
    return { id: entryId, alreadyApplied: false };''', '''      await tx.$executeRaw`UPDATE "SupplierLedgerEntry" SET "financialTransferId"=${transferRows[0].id}::uuid, "sourceName"=${wallet.name}, "updatedAt"=NOW() WHERE "id"=${entryId}::uuid`;
    } else {
      try {
        const movement = await bankAccountService.createBankMovementTx(tx, shopId, userId, {
          bankAccountId: bankAccountId!,
          direction: "OUT",
          amount,
          type: "SUPPLIER_PAYMENT",
          description: nullableText(input.description) ?? `دفعة للمورد ${supplier.name}`,
          reference: nullableText(input.reference),
          sourceType: "SUPPLIER",
          sourceId: supplierId,
          sourceReference: supplier.name,
          counterpartyType: "SUPPLIER",
          counterpartyId: supplierId,
          counterpartyName: supplier.name,
          occurredAt: input.movementOccurredAt,
        });
        await tx.$executeRaw`
          UPDATE "SupplierLedgerEntry"
          SET "bankAccountMovementId"=${movement.movementId}::uuid, "sourceName"=${sourceName}, "updatedAt"=NOW()
          WHERE "id"=${entryId}::uuid
        `;
      } catch (error) {
        if (error instanceof Error && error.message.includes("رصيداً سالباً")) {
          throw new Error(`رصيد الحساب البنكي ${sourceName} غير كافٍ في تاريخ الحركة لدفع المورد.`);
        }
        throw error;
      }
    }
    return { id: entryId, alreadyApplied: false };''', "bank branch")
write(path, s)

path = "app/suppliers/[id]/ledger-actions.ts"
s = read(path)
s = replace_once(s, 'import { timeZoneForCountry, zonedDateTimeToUtc } from "@/lib/timezone";', 'import { localDateString, timeZoneForCountry, zonedDateTimeToUtc } from "@/lib/timezone";', "ledger action timezone import")
s = replace_once(s, '  revalidatePath("/cash-drawer");\n  revalidatePath("/transfers");', '  revalidatePath("/cash-drawer");\n  revalidatePath("/bank-accounts");\n  revalidatePath("/transfers");', "ledger bank revalidate")
s = replace_once(s, 'supplierId: string; requestKey: string; amount: string; occurredAt: string; accountType: "DRAWER" | "WALLET"; walletId?: string; description?: string; reference?: string;', 'supplierId: string; requestKey: string; amount: string; occurredAt: string; accountType: "DRAWER" | "WALLET" | "BANK"; walletId?: string; bankAccountId?: string; description?: string; reference?: string;', "ledger action input")
s = replace_once(s, 'accountType: z.enum(["DRAWER","WALLET"]), walletId: z.string().uuid().optional().or(z.literal("")),', 'accountType: z.enum(["DRAWER","WALLET","BANK"]), walletId: z.string().uuid().optional().or(z.literal("")), bankAccountId: z.string().uuid().optional().or(z.literal("")),', "ledger action schema")
s = replace_once(s, '''    const result = await supplierLedgerService.recordSupplierPayment(auth.shop.id, auth.user.id, parsed.supplierId, {
      requestKey: parsed.requestKey, amount: parsed.amount,
      occurredAt: localNoonUtc(parsed.occurredAt, auth.shop.countryCode), accountType: parsed.accountType,
      walletId: parsed.accountType === "WALLET" ? parsed.walletId || null : null,
      description: parsed.description, reference: parsed.reference,
    });''', '''    if (parsed.accountType === "WALLET" && !parsed.walletId) throw new Error("اختر المحفظة التي ستخرج منها الدفعة.");
    if (parsed.accountType === "BANK" && !parsed.bankAccountId) throw new Error("اختر الحساب البنكي الذي ستخرج منه الدفعة.");
    const timeZone = timeZoneForCountry(auth.shop.countryCode);
    const occurredAt = localNoonUtc(parsed.occurredAt, auth.shop.countryCode);
    const movementOccurredAt = parsed.occurredAt === localDateString(new Date(), timeZone) ? undefined : occurredAt;
    const result = await supplierLedgerService.recordSupplierPayment(auth.shop.id, auth.user.id, parsed.supplierId, {
      requestKey: parsed.requestKey, amount: parsed.amount,
      occurredAt, movementOccurredAt, accountType: parsed.accountType,
      walletId: parsed.accountType === "WALLET" ? parsed.walletId || null : null,
      bankAccountId: parsed.accountType === "BANK" ? parsed.bankAccountId || null : null,
      description: parsed.description, reference: parsed.reference,
    });''', "ledger action service call")
write(path, s)

path = "app/suppliers/[id]/_supplier-ledger.tsx"
s = read(path)
s = replace_once(s, 'events: LedgerEvent[]; drawerBalance: number; wallets: Array<{ id: string; name: string; currentBalance: number }>;', 'events: LedgerEvent[]; drawerBalance: number; wallets: Array<{ id: string; name: string; currentBalance: number }>; bankAccounts: Array<{ id: string; name: string; bankName: string | null; currentBalance: number }>;', "ledger UI props")
s = replace_once(s, 'const [accountType, setAccountType] = useState<"DRAWER" | "WALLET">("DRAWER");\n  const [walletId, setWalletId] = useState("");', 'const [accountType, setAccountType] = useState<"DRAWER" | "WALLET" | "BANK">("DRAWER");\n  const [walletId, setWalletId] = useState("");\n  const [bankAccountId, setBankAccountId] = useState("");', "ledger UI state")
s = replace_once(s, 'const selectedWallet = props.wallets.find((wallet) => wallet.id === walletId);', 'const selectedWallet = props.wallets.find((wallet) => wallet.id === walletId);\n  const selectedBankAccount = props.bankAccounts.find((account) => account.id === bankAccountId);', "ledger UI selected bank")
s = replace_once(s, 'const payload = { amount: String(data.get("amount") || ""), occurredAt: String(data.get("occurredAt") || ""), accountType, walletId: accountType === "WALLET" ? walletId : undefined, description: String(data.get("description") || ""), reference: String(data.get("reference") || "") };', 'const payload = { amount: String(data.get("amount") || ""), occurredAt: String(data.get("occurredAt") || ""), accountType, walletId: accountType === "WALLET" ? walletId : undefined, bankAccountId: accountType === "BANK" ? bankAccountId : undefined, description: String(data.get("description") || ""), reference: String(data.get("reference") || "") };', "ledger UI payload")
s = replace_once(s, '() => { paymentAttempt.current = null; form.reset(); setAccountType("DRAWER"); setWalletId(""); });', '() => { paymentAttempt.current = null; form.reset(); setAccountType("DRAWER"); setWalletId(""); setBankAccountId(""); });', "ledger UI reset")
s = replace_once(s, '''<Field label="الدفع من"><select className="erp-input" value={accountType} onChange={(event) => { setAccountType(event.target.value as "DRAWER" | "WALLET"); setWalletId(""); }}><option value="DRAWER">الدرج النقدي — {money(props.drawerBalance)}</option><option value="WALLET">محفظة إلكترونية</option></select></Field>
          {accountType === "WALLET" ? <Field label="المحفظة"><select required className="erp-input" value={walletId} onChange={(event) => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{props.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}</select></Field> : <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">سيتم الخصم من الدرج النقدي وتسجيل حركة خروج مرتبطة بهذا المورد.</div>}''', '''<Field label="الدفع من"><select className="erp-input" value={accountType} onChange={(event) => { setAccountType(event.target.value as "DRAWER" | "WALLET" | "BANK"); setWalletId(""); setBankAccountId(""); }}><option value="DRAWER">الدرج النقدي — {money(props.drawerBalance)}</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK">حساب بنكي</option></select></Field>
          {accountType === "WALLET" ? <Field label="المحفظة"><select required className="erp-input" value={walletId} onChange={(event) => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{props.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}</select></Field> : accountType === "BANK" ? <Field label="الحساب البنكي"><select required className="erp-input" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}><option value="">اختر الحساب البنكي</option>{props.bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bankName ? `${account.bankName} — ` : ""}{account.name} — {money(account.currentBalance)}</option>)}</select></Field> : <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">سيتم الخصم من الدرج النقدي وتسجيل حركة خروج مرتبطة بهذا المورد.</div>}''', "ledger UI payment selector")
s = replace_once(s, '''        {accountType === "WALLET" && selectedWallet ? <p className="mt-2 text-[10px] font-bold text-teal-700 dark:text-teal-300">سيتم السحب من {selectedWallet.name} — الرصيد الحالي {money(selectedWallet.currentBalance)}.</p> : null}
        <Button disabled={busy || props.totalPayable <= 0 || (accountType === "WALLET" && !walletId)} type="submit" className="mt-4 h-11 w-full rounded-xl font-black">تأكيد دفع المورد</Button>''', '''        {accountType === "WALLET" && selectedWallet ? <p className="mt-2 text-[10px] font-bold text-teal-700 dark:text-teal-300">سيتم السحب من {selectedWallet.name} — الرصيد الحالي {money(selectedWallet.currentBalance)}.</p> : null}
        {accountType === "BANK" && selectedBankAccount ? <p className="mt-2 text-[10px] font-bold text-teal-700 dark:text-teal-300">سيتم السحب من {selectedBankAccount.name} — الرصيد الحالي {money(selectedBankAccount.currentBalance)}، وتسجيل حركة بنكية مرتبطة بالمورد.</p> : null}
        <Button disabled={busy || props.totalPayable <= 0 || (accountType === "WALLET" && !walletId) || (accountType === "BANK" && !bankAccountId)} type="submit" className="mt-4 h-11 w-full rounded-xl font-black">تأكيد دفع المورد</Button>''', "ledger UI bank hint")
write(path, s)

path = "app/suppliers/[id]/_purchase-account.tsx"
s = read(path)
s = replace_once(s, 'type Props = { invoices: Invoice[]; outstanding: string; credit: string; currency: string; canPay: boolean; wallets: {id: string; name: string; currentBalance: string}[]; drawerBalance: string };', 'type Props = { invoices: Invoice[]; outstanding: string; credit: string; currency: string; canPay: boolean; wallets: {id: string; name: string; currentBalance: string}[]; bankAccounts: {id: string; name: string; bankName: string | null; currentBalance: string}[]; drawerBalance: string };', "purchase account props")
s = replace_once(s, 'export function SupplierPurchaseAccount({ invoices, outstanding, credit, currency, canPay, wallets, drawerBalance }: Props) {', 'export function SupplierPurchaseAccount({ invoices, outstanding, credit, currency, canPay, wallets, bankAccounts, drawerBalance }: Props) {', "purchase account args")
s = replace_once(s, 'const [account, setAccount] = useState<"DRAWER" | "WALLET" | "OTHER">("DRAWER");\n  const [walletId, setWalletId] = useState("");', 'const [account, setAccount] = useState<"DRAWER" | "WALLET" | "BANK" | "OTHER">("DRAWER");\n  const [walletId, setWalletId] = useState("");\n  const [bankAccountId, setBankAccountId] = useState("");', "purchase account state")
s = replace_once(s, 'if (account === "WALLET" && !walletId) { setError("اختر المحفظة."); return; }\n    const signature = JSON.stringify([invoice.id, amount, account, account === "WALLET" ? walletId : null]);', 'if (account === "WALLET" && !walletId) { setError("اختر المحفظة."); return; }\n    if (account === "BANK" && !bankAccountId) { setError("اختر الحساب البنكي."); return; }\n    const signature = JSON.stringify([invoice.id, amount, account, account === "WALLET" ? walletId : null, account === "BANK" ? bankAccountId : null]);', "purchase account validation")
s = replace_once(s, 'const result = await recordPurchasePaymentAction({ purchaseId: invoice.id, requestKey: request.key, paidAt: request.paidAt, amount, accountType: account, walletId: account === "WALLET" ? walletId : null, method: account === "DRAWER" ? "CASH" : account === "WALLET" ? "BANK_TRANSFER" : "OTHER", sourceName: account === "DRAWER" ? "الدرج النقدي" : account === "WALLET" ? wallets.find(wallet => wallet.id === walletId)?.name : "دفع خارج النظام" });', 'const result = await recordPurchasePaymentAction({ purchaseId: invoice.id, requestKey: request.key, paidAt: request.paidAt, amount, accountType: account, walletId: account === "WALLET" ? walletId : null, bankAccountId: account === "BANK" ? bankAccountId : null, method: account === "DRAWER" ? "CASH" : account === "OTHER" ? "OTHER" : "BANK_TRANSFER", sourceName: account === "DRAWER" ? "الدرج النقدي" : account === "WALLET" ? wallets.find(wallet => wallet.id === walletId)?.name : account === "BANK" ? bankAccounts.find(bank => bank.id === bankAccountId)?.name : "دفع خارج النظام" });', "purchase account action")
s = replace_once(s, '''<label className="grid gap-1 text-xs font-bold">الدفع من<select disabled={busy} className="erp-input" value={account} onChange={event => setAccount(event.target.value as typeof account)}><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة</option><option value="OTHER">خارج النظام — بدون خصم</option></select></label>
        {account === "WALLET" && <label className="grid gap-1 text-xs font-bold">اختر المحفظة<select disabled={busy} className="erp-input" value={walletId} onChange={event => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{wallets.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}</select></label>}''', '''<label className="grid gap-1 text-xs font-bold">الدفع من<select disabled={busy} className="erp-input" value={account} onChange={event => { setAccount(event.target.value as typeof account); setWalletId(""); setBankAccountId(""); }}><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة</option><option value="BANK">حساب بنكي</option><option value="OTHER">خارج النظام — بدون خصم</option></select></label>
        {account === "WALLET" && <label className="grid gap-1 text-xs font-bold">اختر المحفظة<select disabled={busy} className="erp-input" value={walletId} onChange={event => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{wallets.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}</select></label>}
        {account === "BANK" && <label className="grid gap-1 text-xs font-bold">اختر الحساب البنكي<select disabled={busy} className="erp-input" value={bankAccountId} onChange={event => setBankAccountId(event.target.value)}><option value="">اختر الحساب البنكي</option>{bankAccounts.map(bank => <option value={bank.id} key={bank.id}>{bank.bankName ? `${bank.bankName} — ` : ""}{bank.name} — {money(bank.currentBalance)}</option>)}</select></label>}''', "purchase account selector")
s = replace_once(s, '{account === "DRAWER" ? `رصيد الدرج: ${money(drawerBalance)}` : account === "OTHER" ? "هذه الدفعة تسدد الدين دون تغيير أرصدة الدرج أو المحافظ." : "تُسجّل حركة خصم من المحفظة المختارة."}', '{account === "DRAWER" ? `رصيد الدرج: ${money(drawerBalance)}` : account === "OTHER" ? "هذه الدفعة تسدد الدين دون تغيير أرصدة الدرج أو المحافظ أو البنوك." : account === "BANK" ? "تُسجّل حركة خصم من الحساب البنكي المختار ومرتبطة بفاتورة الشراء." : "تُسجّل حركة خصم من المحفظة المختارة."}', "purchase account hint")
write(path, s)

path = "app/suppliers/[id]/page.tsx"
s = read(path)
s = replace_once(s, 'import { supplierLedgerService } from "@/lib/services/supplierLedgerService";', 'import { supplierLedgerService } from "@/lib/services/supplierLedgerService";\nimport { bankAccountService } from "@/lib/services/bankAccountService";', "supplier page bank import")
s = replace_once(s, 'const [purchaseAccount, wallets, drawerBalance, supplierLedger] = await Promise.all([', 'const [purchaseAccount, wallets, drawerBalance, supplierLedger, bankAccounts] = await Promise.all([', "supplier page promise tuple")
s = replace_once(s, '''    canReadPurchases ? supplierLedgerService.getSupplierLedger(context.shopId, id) : null,
  ]);''', '''    canReadPurchases ? supplierLedgerService.getSupplierLedger(context.shopId, id) : null,
    canReadPurchases && canPayPurchases ? bankAccountService.listAccounts(context.shopId) : [],
  ]);''', "supplier page bank query")
s = replace_once(s, '''        wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: Number(wallet.currentBalance) }))}
        events={supplierLedger.events.map''', '''        wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: Number(wallet.currentBalance) }))}
        bankAccounts={bankAccounts.map(account => ({ id: account.id, name: account.name, bankName: account.bankName, currentBalance: Number(account.currentBalance) }))}
        events={supplierLedger.events.map''', "supplier ledger banks prop")
s = replace_once(s, 'wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: wallet.currentBalance.toString() }))} invoices=', 'wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: wallet.currentBalance.toString() }))} bankAccounts={bankAccounts.map(account => ({ id: account.id, name: account.name, bankName: account.bankName, currentBalance: account.currentBalance.toString() }))} invoices=', "purchase account banks prop")
write(path, s)

path = "lib/bank-account-presentation.ts"
s = read(path)
s = replace_once(s, '    PURCHASE_PAYMENT: "دفع مشتريات",\n    SUPPLIER_REFUND: "استرداد مورد",', '    PURCHASE_PAYMENT: "دفع مشتريات",\n    SUPPLIER_PAYMENT: "دفعة للمورد",\n    SUPPLIER_REFUND: "استرداد مورد",', "supplier movement label")
write(path, s)

migration = r'''-- Add tracked bank-account support to direct supplier-ledger payments.
-- This migration is additive and preserves all existing supplier ledger rows.

ALTER TABLE "SupplierLedgerEntry"
  ADD COLUMN IF NOT EXISTS "bankAccountId" UUID,
  ADD COLUMN IF NOT EXISTS "bankAccountMovementId" UUID;

ALTER TABLE "SupplierLedgerEntry"
  DROP CONSTRAINT IF EXISTS "SupplierLedgerEntry_account_check",
  DROP CONSTRAINT IF EXISTS "SupplierLedgerEntry_wallet_account_check";

ALTER TABLE "SupplierLedgerEntry"
  ADD CONSTRAINT "SupplierLedgerEntry_account_check"
    CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET','BANK')),
  ADD CONSTRAINT "SupplierLedgerEntry_wallet_account_check"
    CHECK (
      ("accountType" = 'WALLET' AND "walletId" IS NOT NULL AND "bankAccountId" IS NULL)
      OR ("accountType" = 'BANK' AND "walletId" IS NULL AND "bankAccountId" IS NOT NULL)
      OR ("accountType" = 'DRAWER' AND "walletId" IS NULL AND "bankAccountId" IS NULL)
      OR ("accountType" IS NULL AND "walletId" IS NULL AND "bankAccountId" IS NULL)
    );

CREATE INDEX IF NOT EXISTS "SupplierLedgerEntry_bankAccountId_idx"
  ON "SupplierLedgerEntry"("bankAccountId") WHERE "bankAccountId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SupplierLedgerEntry_bankAccountMovementId_idx"
  ON "SupplierLedgerEntry"("bankAccountMovementId") WHERE "bankAccountMovementId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierLedgerEntry_bankAccountId_fkey') THEN
    ALTER TABLE "SupplierLedgerEntry"
      ADD CONSTRAINT "SupplierLedgerEntry_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierLedgerEntry_bankAccountMovementId_fkey') THEN
    ALTER TABLE "SupplierLedgerEntry"
      ADD CONSTRAINT "SupplierLedgerEntry_bankAccountMovementId_fkey"
      FOREIGN KEY ("bankAccountMovementId") REFERENCES "BankAccountMovement"("id") ON DELETE SET NULL;
  END IF;
END $$;
'''
write("prisma/migrations/20260910150000_supplier_ledger_bank_payments/migration.sql", migration)

checks = {
    "lib/services/supplierLedgerService.ts": ['SupplierPaymentAccountType = "DRAWER" | "WALLET" | "BANK"', 'type: "SUPPLIER_PAYMENT"', 'counterpartyType: "SUPPLIER"', '"bankAccountMovementId"'],
    "app/suppliers/[id]/ledger-actions.ts": ['z.enum(["DRAWER","WALLET","BANK"])', 'movementOccurredAt', 'revalidatePath("/bank-accounts")'],
    "app/suppliers/[id]/_supplier-ledger.tsx": ['<option value="BANK">حساب بنكي</option>', 'bankAccountId'],
    "app/suppliers/[id]/_purchase-account.tsx": ['<option value="BANK">حساب بنكي</option>', 'bankAccountId: account === "BANK"'],
}
for file, needles in checks.items():
    text = read(file)
    for needle in needles:
        if needle not in text:
            raise SystemExit(f"{file}: missing invariant {needle}")

print("SUPPLIER_BANK_FIX_APPLIED")
