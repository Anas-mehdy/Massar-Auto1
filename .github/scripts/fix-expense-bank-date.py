from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# 1) Keep Expense.spentAt as the accounting/reporting date, but use the DB clock
# for the actual bank movement when the selected date is the shop's current day.
actions_path = Path("app/reports/actions.ts")
actions = actions_path.read_text()
actions = replace_once(
    actions,
    'import { timeZoneForCountry, zonedDateTimeToUtc } from "@/lib/timezone";',
    'import { localDateString, timeZoneForCountry, zonedDateTimeToUtc } from "@/lib/timezone";',
    "reports timezone import",
)
actions = replace_once(
    actions,
    '  const auth = await requirePermission("expenses:manage");\n  const timeZone = timeZoneForCountry(auth.shop.countryCode);\n\n  await expenseMoneyService.createExpense(auth.shop.id, auth.user.id, {',
    '  const auth = await requirePermission("expenses:manage");\n  const timeZone = timeZoneForCountry(auth.shop.countryCode);\n  const spentAt = localNoonUtc(input.spentAt, timeZone);\n  const movementOccurredAt = input.spentAt === localDateString(new Date(), timeZone)\n    ? undefined\n    : spentAt;\n\n  await expenseMoneyService.createExpense(auth.shop.id, auth.user.id, {',
    "reports expense date preparation",
)
actions = replace_once(
    actions,
    '    spentAt: localNoonUtc(input.spentAt, timeZone),\n    notes: input.notes,',
    '    spentAt,\n    movementOccurredAt,\n    notes: input.notes,',
    "reports expense service input",
)
actions_path.write_text(actions)

# 2) The expense service separates the accounting date from the ledger timestamp.
expense_path = Path("lib/services/expenseMoneyService.ts")
expense = expense_path.read_text()
expense = replace_once(
    expense,
    '  spentAt: Date;\n  notes?: string;',
    '  spentAt: Date;\n  movementOccurredAt?: Date;\n  notes?: string;',
    "expense input movement timestamp",
)
expense = replace_once(
    expense,
    '      occurredAt: input.spentAt,',
    '      occurredAt: input.movementOccurredAt,',
    "expense money movement timestamp",
)
expense_path.write_text(expense)

# 3) For BANK only, preserve an absent explicit timestamp so bankAccountService
# can use PostgreSQL NOW() inside the transaction. Drawer/wallet behavior is unchanged.
money_path = Path("lib/services/moneyAccountService.ts")
money = money_path.read_text()

# Incoming BANK call is indented one level less than the outgoing BANK call.
money = replace_once(
    money,
    '      type: movementType,\n      occurredAt,\n      description: input.description,',
    '      type: movementType,\n      occurredAt: input.occurredAt,\n      description: input.description,',
    "incoming bank occurredAt forwarding",
)
money = replace_once(
    money,
    '        type: movementType,\n        occurredAt,\n        description: input.description,',
    '        type: movementType,\n        occurredAt: input.occurredAt,\n        description: input.description,',
    "outgoing bank occurredAt forwarding",
)
money = replace_once(
    money,
    'throw new Error(`رصيد الحساب البنكي غير كافٍ لتسديد ${contextLabel}.`);',
    'throw new Error(`رصيد الحساب البنكي غير كافٍ في تاريخ الحركة لتسديد ${contextLabel}.`);',
    "historical bank balance message",
)
money_path.write_text(money)

# Guardrails: ensure the intended separation exists and the old expense coupling is gone.
assert 'movementOccurredAt?: Date;' in expense
assert 'occurredAt: input.movementOccurredAt,' in expense
assert 'occurredAt: input.spentAt,' not in expense
assert actions.count('movementOccurredAt') == 2
assert money.count('occurredAt: input.occurredAt,') >= 2

print("EXPENSE_BANK_DATE_FIX_APPLIED")
