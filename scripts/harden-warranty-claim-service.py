from pathlib import Path

service_path = Path("lib/services/serviceWarrantyClaimService.ts")
text = service_path.read_text()

old = '''  const customerCharge = input.customerCharge ?? 0;
  if (!Number.isFinite(customerCharge) || customerCharge < 0) throw new Error("مبلغ العميل غير صالح.");
  const note = clean(input.note);
'''
new = '''  let customerCharge = input.customerCharge ?? 0;
  if (!Number.isFinite(customerCharge) || customerCharge < 0) throw new Error("مبلغ العميل غير صالح.");
  let coverageDecision: Exclude<WarrantyCoverageDecision, "PENDING"> = input.coverageDecision;
  if (input.decision === "REJECTED") {
    // A rejected warranty/comeback claim is not billable through the claim itself.
    // Any later paid repair must be a normal ServiceOrder, not a rejected warranty follow-up.
    coverageDecision = "NOT_APPLICABLE";
    customerCharge = 0;
  } else {
    if (!["COVERED", "PARTIAL", "CUSTOMER_PAY"].includes(coverageDecision)) {
      throw new Error("المطالبة المعتمدة تتطلب تحديد تغطية كاملة أو جزئية أو على حساب العميل.");
    }
    if (coverageDecision === "COVERED" && customerCharge !== 0) {
      throw new Error("المطالبة المغطاة بالكامل لا يمكن أن تحمل مبلغاً على العميل.");
    }
  }
  const note = clean(input.note);
'''
if text.count(old) != 1:
    raise SystemExit(f"decision validation anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)

start = text.index("export async function decideWarrantyClaim(")
end = text.index("export async function createWarrantyFollowUpOrder(", start)
segment = text[start:end]
if segment.count("${input.coverageDecision}") != 2:
    raise SystemExit(f"coverage SQL anchor mismatch: {segment.count('${input.coverageDecision}')}")
segment = segment.replace("${input.coverageDecision}", "${coverageDecision}")
if segment.count("coverageDecision: input.coverageDecision") != 1:
    raise SystemExit("coverage return anchor mismatch")
segment = segment.replace("coverageDecision: input.coverageDecision", "coverageDecision")
text = text[:start] + segment + text[end:]
service_path.write_text(text)

page_path = Path("app/service-orders/[id]/warranty/page.tsx")
page = page_path.read_text()
old = 'مبلغ العميل <span className="font-semibold text-slate-400">إن وجد</span><input name="customerCharge"'
new = 'مبلغ العميل <span className="font-semibold text-slate-400">مرجعي فقط — لا يصدر فاتورة تلقائياً</span><input name="customerCharge"'
if page.count(old) != 1:
    raise SystemExit(f"customer charge UI anchor mismatch: {page.count(old)}")
page = page.replace(old, new, 1)

old = '<option value="NOT_APPLICABLE">لا ينطبق</option></select></label>'
new = '<option value="NOT_APPLICABLE">لا ينطبق</option></select><span className="font-semibold text-slate-400">عند رفض المطالبة يحفظ النظام «لا ينطبق» ومبلغ العميل 0 تلقائياً.</span></label>'
if page.count(old) != 1:
    raise SystemExit(f"coverage help UI anchor mismatch: {page.count(old)}")
page = page.replace(old, new, 1)
page_path.write_text(page)
