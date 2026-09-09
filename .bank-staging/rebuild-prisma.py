#!/usr/bin/env python3
import json
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

shop_tz = Path("lib/shop-timezone.ts")
shop_text = shop_tz.read_text()
if "dateInputStartUtcForTimeZone," not in shop_text or "dateInputEndUtcForTimeZone," not in shop_text:
    anchor = "  dateInputUtcBoundsForTimeZone,\n"
    if anchor not in shop_text:
        raise SystemExit("shop-timezone date export anchor not found")
    shop_text = shop_text.replace(anchor, "  dateInputEndUtcForTimeZone,\n  dateInputStartUtcForTimeZone,\n" + anchor, 1)
    shop_tz.write_text(shop_text)
print("SHOP_TIMEZONE_BANK_COMPAT_OK")

software = Path("lib/services/softwareServiceService.ts")
software_text = software.read_text()
old_cost_type = '        drawerType: "SOFTWARE_SERVICE_COST",'
new_cost_type = '        movementType: "SOFTWARE_SERVICE_COST",'
if old_cost_type in software_text:
    software_text = software_text.replace(old_cost_type, new_cost_type, 1)
elif new_cost_type not in software_text:
    raise SystemExit("software service cost movement classification anchor not found")
software.write_text(software_text)
print("SOFTWARE_SERVICE_BANK_MOVEMENT_TYPE_OK")

activation = Path("app/electronic-services/new/_activation-success.tsx")
activation_text = activation.read_text()
old_union = 'paymentDestination: "DRAWER" | "WALLET" | "OTHER" | "DEBT";'
new_union = 'paymentDestination: "DRAWER" | "WALLET" | "BANK" | "OTHER" | "DEBT";'
if old_union in activation_text:
    activation_text = activation_text.replace(old_union, new_union, 1)
elif new_union not in activation_text:
    raise SystemExit("electronic service activation payment destination union not found")
activation.write_text(activation_text)
print("ELECTRONIC_SERVICE_ACTIVATION_BANK_TYPE_OK")

# Build lint: Stat.icon is JSX content, so use ReactNode rather than any.
bank_page = Path("app/bank-accounts/page.tsx")
bank_page_text = bank_page.read_text()
old_stat = "function Stat({ icon,title,value,helper }:{ icon:any; title:string; value:string; helper:string })"
new_stat = "function Stat({ icon,title,value,helper }:{ icon:ReactNode; title:string; value:string; helper:string })"
if old_stat in bank_page_text:
    bank_page_text = bank_page_text.replace(old_stat, new_stat, 1)
elif new_stat not in bank_page_text:
    raise SystemExit("bank Stat icon type anchor not found")
react_node_import = 'import type { ReactNode } from "react";'
if react_node_import not in bank_page_text:
    bank_page_text = react_node_import + "\n" + bank_page_text
bank_page.write_text(bank_page_text)
print("BANK_PAGE_STAT_REACT_NODE_OK")

regression = Path("/tmp/massar-bank/bank-staging-payload/regression-bank-ledger.mjs")
if not regression.exists():
    raise SystemExit("bank regression bundle not found")
regression_text = regression.read_text()
root_decl = "const root = '/mnt/data/massar-bank-local';"
if root_decl not in regression_text:
    raise SystemExit("expected regression local root declaration not found")
repo_root = str(Path.cwd())
patch_root = "/tmp/massar-bank/bank-staging-payload/patches"
regression_text = regression_text.replace(root_decl, f"const root = {json.dumps(repo_root)};\nconst patchRoot = {json.dumps(patch_root)};", 1)
patch_refs = {
    "path.join(root,'patches/software-services-bank-integration.patch')": "path.join(patchRoot,'software-services-bank-integration.patch')",
    "path.join(root,'patches/daily-summary-bank-integration.patch')": "path.join(patchRoot,'daily-summary-bank-integration.patch')",
    "path.join(root,'patches/financial-transfer-source-types.patch')": "path.join(patchRoot,'financial-transfer-source-types.patch')",
    "path.join(root,'patches/purchase-bank-integration.patch')": "path.join(patchRoot,'purchase-bank-integration.patch')",
    "files(path.join(root,'patches'))": "files(patchRoot)",
}
for old, new in patch_refs.items():
    if regression_text.count(old) != 1:
        raise SystemExit(f"expected exactly one regression patch-path anchor: {old}")
    regression_text = regression_text.replace(old, new, 1)
candidate_old = "const candidates = files(root).filter(f => !f.endsWith('.patch') && !f.endsWith('bankAccountService.ts') && !f.endsWith('migration.sql') && !f.endsWith('regression-bank-ledger.mjs'));"
candidate_new = "const candidates = files(root).filter(f => !f.split(path.sep).some(part => ['node_modules','.git','.next'].includes(part)) && !f.endsWith('.patch') && !f.endsWith('bankAccountService.ts') && !f.endsWith('migration.sql') && !f.endsWith('regression-bank-ledger.mjs'));"
if regression_text.count(candidate_old) != 1:
    raise SystemExit("expected regression source-candidate anchor not found exactly once")
regression_text = regression_text.replace(candidate_old, candidate_new, 1)
if "/mnt/data/massar-bank-local" in regression_text:
    raise SystemExit("stale local regression root remains")
regression.write_text(regression_text)
print("BANK_REGRESSION_PATHS_REBASED_OK")
print("BANK_REGRESSION_GENERATED_TREES_EXCLUDED_OK")
print("BANK_COMPAT_REPAIRS_OK")
