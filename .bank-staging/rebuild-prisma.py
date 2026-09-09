#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("usage: rebuild-prisma.py <main-head>")

main_head = sys.argv[1]
schema = subprocess.check_output(["git", "show", f"{main_head}:prisma/schema.prisma"], text=True)


def patch_model(text: str, model: str, after_field: str, new_field: str, new_index: str) -> str:
    marker = f"model {model} {{"
    start = text.find(marker)
    if start < 0:
        raise SystemExit(f"model not found: {model}")
    end = text.find("\n}", start)
    if end < 0:
        raise SystemExit(f"model end not found: {model}")
    end += 2
    block = text[start:end]
    if new_field.strip() not in block:
        lines = block.splitlines()
        match = next((i for i, line in enumerate(lines) if line.strip().startswith(after_field)), None)
        if match is None:
            raise SystemExit(f"field anchor not found in {model}: {after_field}")
        lines.insert(match + 1, new_field)
        block = "\n".join(lines)
    if new_index.strip() not in block:
        lines = block.splitlines()
        lines.insert(len(lines) - 1, new_index)
        block = "\n".join(lines)
    return text[:start] + block + text[end:]


schema = patch_model(schema, "PurchaseInvoice", "paymentWalletId", "  paymentBankAccountId  String?   @db.Uuid", "  @@index([paymentBankAccountId])")
schema = patch_model(schema, "PurchasePayment", "walletId", "  bankAccountId     String?   @db.Uuid", "  @@index([bankAccountId])")
schema = patch_model(schema, "SupplierReturnSettlement", "walletId", "  bankAccountId     String?   @db.Uuid", "  @@index([bankAccountId])")
schema = patch_model(schema, "Expense", "fundingWalletName", "  fundingBankAccountId String?         @db.Uuid", "  @@index([fundingBankAccountId])")

bank_models = """

model BankAccount {
  id                  String    @id @default(uuid()) @db.Uuid
  shopId              String    @db.Uuid
  name                String
  bankName            String?
  openingBalance      Decimal   @default(0) @db.Decimal(14, 2)
  currentBalance      Decimal   @default(0) @db.Decimal(14, 2)
  openingBalanceSetAt DateTime?
  isActive            Boolean   @default(true)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  deletedAt           DateTime?

  @@index([shopId, isActive, createdAt])
  @@index([shopId, deletedAt])
}

model BankAccountMovement {
  id               String    @id @default(uuid()) @db.Uuid
  shopId           String    @db.Uuid
  bankAccountId    String    @db.Uuid
  createdByUserId  String?   @db.Uuid
  voidedByUserId   String?   @db.Uuid
  customerId       String?   @db.Uuid
  type             String
  direction        String    @db.VarChar(3)
  amount           Decimal   @db.Decimal(14, 2)
  balanceBefore    Decimal   @default(0) @db.Decimal(14, 2)
  balanceAfter     Decimal   @default(0) @db.Decimal(14, 2)
  description      String?
  reference        String?
  sourceType       String    @default("MANUAL")
  sourceId         String?
  sourceReference  String?
  counterpartyType String?
  counterpartyId   String?
  counterpartyName String?
  transferGroupId  String?   @db.Uuid
  status           String    @default("ACTIVE") @db.VarChar(12)
  occurredAt       DateTime  @default(now())
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  voidedAt         DateTime?

  @@index([shopId, occurredAt, createdAt])
  @@index([bankAccountId, occurredAt, createdAt])
  @@index([shopId, sourceType, sourceId])
  @@index([shopId, customerId, occurredAt])
  @@index([shopId, transferGroupId])
  @@index([shopId, status, occurredAt])
}
"""

if "model BankAccount {" in schema or "model BankAccountMovement {" in schema:
    raise SystemExit("bank models unexpectedly already present in exact-main schema")

schema = schema.rstrip() + bank_models + "\n"
Path("prisma/schema.prisma").write_text(schema)

head = "\n".join(schema.splitlines()[:8])
if "model BankAccount" in head or "@@index" in head:
    raise SystemExit("bank schema content leaked into generator/datasource header")

print("PRISMA_SCHEMA_REBUILT_OK")

# ---------------------------------------------------------------------------
# Compatibility repairs against exact current main. These preserve existing
# contracts that the reviewed bank payload accidentally narrowed.
# ---------------------------------------------------------------------------

# The bank-account page uses these helpers through the shop-timezone facade.
shop_tz = Path("lib/shop-timezone.ts")
shop_tz_text = shop_tz.read_text()
if "dateInputStartUtcForTimeZone," not in shop_tz_text or "dateInputEndUtcForTimeZone," not in shop_tz_text:
    anchor = "  dateInputUtcBoundsForTimeZone,\n"
    if anchor not in shop_tz_text:
        raise SystemExit("shop-timezone date export anchor not found")
    shop_tz_text = shop_tz_text.replace(
        anchor,
        "  dateInputEndUtcForTimeZone,\n  dateInputStartUtcForTimeZone,\n" + anchor,
        1,
    )
    shop_tz.write_text(shop_tz_text)
print("SHOP_TIMEZONE_BANK_COMPAT_OK")

# Keep the form's explicit destination union aligned with the service type.
service_form = Path("app/electronic-services/new/_service-form.tsx")
service_text = service_form.read_text()
service_lines = service_text.splitlines(keepends=True)
service_union_changes = 0
for i, line in enumerate(service_lines):
    if all(token in line for token in ['"DRAWER"', '"WALLET"', '"OTHER"', '"DEBT"']) and '"BANK"' not in line:
        service_lines[i] = line.replace('"WALLET"', '"WALLET" | "BANK"', 1)
        service_union_changes += 1
if service_union_changes:
    service_form.write_text("".join(service_lines))
print(f"ELECTRONIC_SERVICE_BANK_UNIONS_OK changes={service_union_changes}")

# Preserve the outgoing-money API used by software-service cost payments.
money_file = Path("lib/services/moneyAccountService.ts")
money_text = money_file.read_text()
fn_start = money_text.find("export async function applyOutgoingMoneyTx")
if fn_start < 0:
    raise SystemExit("applyOutgoingMoneyTx not found")
fn_end = money_text.find("\n}\n", fn_start)
if fn_end < 0:
    raise SystemExit("applyOutgoingMoneyTx end not found")
block = money_text[fn_start:fn_end]

if "drawerType?:" not in block:
    desc = "    description: string;"
    desc_pos = money_text.find(desc, fn_start, fn_end)
    if desc_pos < 0:
        raise SystemExit("applyOutgoingMoneyTx description field not found")
    insert_at = desc_pos + len(desc)
    money_text = (
        money_text[:insert_at]
        + "\n    drawerType?: \"CHANGE_RETURN\" | \"SOFTWARE_SERVICE_COST\";\n    contextLabel?: string;"
        + money_text[insert_at:]
    )

# Re-locate the function after the signature insertion.
fn_start = money_text.find("export async function applyOutgoingMoneyTx")
fn_end = money_text.find("\n}\n", fn_start)
block = money_text[fn_start:fn_end]

# The generalized bank implementation must keep the drawer movement classification.
if "input.drawerType" not in block[block.find("input: {") + 8:]:
    # Add a local classification variable after the amount normalization line.
    amount_marker = "  const amount = decimal(input.amount);"
    amount_pos = money_text.find(amount_marker, fn_start, fn_end)
    if amount_pos < 0:
        raise SystemExit("applyOutgoingMoneyTx amount marker not found")
    amount_insert = amount_pos + len(amount_marker)
    money_text = money_text[:amount_insert] + "\n  const drawerType = input.drawerType ?? \"CHANGE_RETURN\";" + money_text[amount_insert:]

    # Re-locate and require exactly one hard-coded CHANGE_RETURN in the drawer SQL path.
    fn_start = money_text.find("export async function applyOutgoingMoneyTx")
    fn_end = money_text.find("\n}\n", fn_start)
    block = money_text[fn_start:fn_end]
    candidates = [
        ("${\"CHANGE_RETURN\"}", "${drawerType}"),
        ("${'CHANGE_RETURN'}", "${drawerType}"),
        ("'CHANGE_RETURN', 'OUT'", "${drawerType}, 'OUT'"),
        ('"CHANGE_RETURN", \'OUT\'', "${drawerType}, 'OUT'"),
    ]
    applied = False
    for old, new in candidates:
        if old in block:
            block = block.replace(old, new, 1)
            applied = True
            break
    if not applied:
        raise SystemExit("could not safely preserve drawerType in outgoing drawer movement")
    money_text = money_text[:fn_start] + block + money_text[fn_end:]

money_file.write_text(money_text)
print("MONEY_ACCOUNT_OUTGOING_COMPAT_OK")
print("BANK_COMPAT_REPAIRS_OK")
