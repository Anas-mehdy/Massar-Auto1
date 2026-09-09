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
print("PRISMA_SCHEMA_REBUILT_OK")

# Known safe compatibility: timezone.ts owns these helpers, shop-timezone is the facade.
shop_tz = Path("lib/shop-timezone.ts")
shop_text = shop_tz.read_text()
if "dateInputStartUtcForTimeZone," not in shop_text or "dateInputEndUtcForTimeZone," not in shop_text:
    anchor = "  dateInputUtcBoundsForTimeZone,\n"
    if anchor not in shop_text:
        raise SystemExit("shop-timezone date export anchor not found")
    shop_text = shop_text.replace(anchor, "  dateInputEndUtcForTimeZone,\n  dateInputStartUtcForTimeZone,\n" + anchor, 1)
    shop_tz.write_text(shop_text)
print("SHOP_TIMEZONE_BANK_COMPAT_OK")


def print_numbered(path: str, start: int = 1, end: int | None = None):
    lines = Path(path).read_text().splitlines()
    end = min(end or len(lines), len(lines))
    print(f"=== {path} lines {start}-{end} ===")
    for number in range(start, end + 1):
        print(f"{number:04d}: {lines[number - 1]}")

money = Path("lib/services/moneyAccountService.ts").read_text()
fn_start = money.find("export async function applyOutgoingMoneyTx")
if fn_start < 0:
    raise SystemExit("applyOutgoingMoneyTx not found")
fn_end = money.find("\n}\n", fn_start)
if fn_end < 0:
    raise SystemExit("applyOutgoingMoneyTx end not found")
print("=== EXACT applyOutgoingMoneyTx ===")
print(money[fn_start:fn_end + 2])

form_lines = Path("app/electronic-services/new/_service-form.tsx").read_text().splitlines()
print("=== electronic service form destination-related lines ===")
for i, line in enumerate(form_lines, 1):
    if any(key in line for key in ["paymentDestination", "defaultPayment", "destination:", "destination?", "destination "]):
        lo, hi = max(1, i - 2), min(len(form_lines), i + 2)
        for n in range(lo, hi + 1):
            print(f"FORM {n:04d}: {form_lines[n-1]}")

print_numbered("app/electronic-services/new/page.tsx", 45, 70)
raise SystemExit("BANK_DEBUG_STOP_AFTER_EXACT_SOURCE_DUMP")
