from pathlib import Path

# Fix optional string inputs from Zod forms without weakening numeric validation.
actions_path = Path("app/service-orders/warranty-actions.ts")
actions = actions_path.read_text()
old = '''function optionalNumber(value: string) {
  if (!value.trim()) return null;'''
new = '''function optionalNumber(value?: string) {
  if (!value?.trim()) return null;'''
count = actions.count(old)
if count != 1:
    raise SystemExit(f"optionalNumber anchor mismatch: {count}")
actions_path.write_text(actions.replace(old, new, 1))

# The input type already excludes PENDING; keep runtime validation at the action/schema boundary.
service_path = Path("lib/services/serviceWarrantyClaimService.ts")
service = service_path.read_text()
old = '  if (input.coverageDecision === "PENDING") throw new Error("يجب تحديد قرار التغطية.");\n'
count = service.count(old)
if count != 1:
    raise SystemExit(f"coverage pending anchor mismatch: {count}")
service_path.write_text(service.replace(old, "", 1))
