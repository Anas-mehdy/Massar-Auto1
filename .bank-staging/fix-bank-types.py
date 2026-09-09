#!/usr/bin/env python3
from pathlib import Path
import re


def read(path: str) -> tuple[Path, str]:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"missing file: {path}")
    return p, p.read_text()


def write_if_changed(p: Path, before: str, after: str, label: str) -> None:
    if before == after:
        raise SystemExit(f"no {label} change applied")
    p.write_text(after)
    print(f"FIXED {label}: {p}")

# 1) The bank accounts page uses the existing date-input helpers from shop-timezone.
# timezone.ts already exports them; keep shop-timezone as the server-facing facade.
p, text = read("lib/shop-timezone.ts")
if "dateInputStartUtcForTimeZone," not in text or "dateInputEndUtcForTimeZone," not in text:
    anchor = "  dateInputUtcBoundsForTimeZone,\n"
    if anchor not in text:
        raise SystemExit("shop-timezone export anchor not found")
    updated = text.replace(
        anchor,
        "  dateInputEndUtcForTimeZone,\n  dateInputStartUtcForTimeZone,\n" + anchor,
        1,
    )
    write_if_changed(p, text, updated, "shop-timezone date helper exports")
else:
    print("OK shop-timezone date helper exports already present")

# 2) Keep every explicit electronic-service destination union in sync with the service type.
p, text = read("app/electronic-services/new/_service-form.tsx")
lines = text.splitlines(keepends=True)
changed = 0
for i, line in enumerate(lines):
    if all(token in line for token in ['"DRAWER"', '"WALLET"', '"OTHER"', '"DEBT"']) and '"BANK"' not in line:
        if '"WALLET"' not in line:
            continue
        lines[i] = line.replace('"WALLET"', '"WALLET" | "BANK"', 1)
        changed += 1
updated = "".join(lines)
if changed:
    p.write_text(updated)
    print(f"FIXED electronic service destination unions: {changed}")
else:
    print("OK no stale electronic-service destination union found")

# 3) Preserve the pre-bank outgoing-money call contract used by software-service costs.
# Bank support adds bankAccountId but must not regress drawer movement classification/context.
p, text = read("lib/services/moneyAccountService.ts")
start = text.find("export async function applyOutgoingMoneyTx")
if start < 0:
    raise SystemExit("applyOutgoingMoneyTx not found")
end = text.find("\n}\n", start)
if end < 0:
    raise SystemExit("applyOutgoingMoneyTx end not found")
block = text[start:end]
updated = text
if "drawerType?:" not in block:
    # Insert into the input object after description, keeping the bank-aware signature intact.
    search_from = start
    desc_pos = updated.find("    description: string;", search_from)
    if desc_pos < 0 or desc_pos > end:
        raise SystemExit("applyOutgoingMoneyTx description field not found")
    insert_at = desc_pos + len("    description: string;")
    updated = updated[:insert_at] + "\n    drawerType?: \"CHANGE_RETURN\" | \"SOFTWARE_SERVICE_COST\";\n    contextLabel?: string;" + updated[insert_at:]
    print("FIXED applyOutgoingMoneyTx compatibility fields")
else:
    print("OK applyOutgoingMoneyTx compatibility fields already present")

# If the bank-aware implementation no longer consumes these compatibility fields, that is
# acceptable for type compatibility only if source metadata remains authoritative. Make the
# intent explicit to avoid noUnused-style regressions without changing runtime accounting.
if updated != text:
    p.write_text(updated)

print("BANK_TYPE_COMPAT_FIXES_OK")
