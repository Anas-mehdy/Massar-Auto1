from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# 1) Keep customer decisions auditable: once waiting for customer approval,
# approval/rejection must be recorded through the quotation workflow.
service_order_path = Path("lib/services/autoServiceOrderService.ts")
text = service_order_path.read_text()
text = replace_once(
    text,
    '  WAITING_CUSTOMER_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],',
    '  WAITING_CUSTOMER_APPROVAL: ["CANCELLED"],',
    "backend waiting-customer transitions",
)
text = replace_once(
    text,
    '  REJECTED: ["CLOSED"],',
    '  REJECTED: [],',
    "backend rejected terminal transition",
)
service_order_path.write_text(text)

ui_path = Path("lib/auto/service-order-ui.ts")
text = ui_path.read_text()
text = replace_once(
    text,
    '  WAITING_CUSTOMER_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],',
    '  WAITING_CUSTOMER_APPROVAL: ["CANCELLED"],',
    "UI waiting-customer transitions",
)
ui_path.write_text(text)

# 2) Closing after a post-delivery credit note must preserve the effective
# invoice total instead of restoring the original invoice gross total.
delivery_path = Path("lib/services/serviceDeliveryService.ts")
text = delivery_path.read_text()
text = replace_once(
    text,
    '''    total: number;\n    balanceDue: number;\n  }>>`\n    SELECT "id", "invoiceNumber", "status"::text AS "status",\n           "total"::double precision AS "total",\n           "balanceDue"::double precision AS "balanceDue"\n    FROM "Invoice"\n''',
    '''    total: number;\n    effectiveTotal: number;\n    balanceDue: number;\n  }>>`\n    SELECT i."id", i."invoiceNumber", i."status"::text AS "status",\n           i."total"::double precision AS "total",\n           GREATEST(\n             i."total" - COALESCE((\n               SELECT SUM(cn."amount")\n               FROM "InvoiceCreditNote" cn\n               WHERE cn."shopId" = i."shopId" AND cn."invoiceId" = i."id"\n             ), 0),\n             0\n           )::double precision AS "effectiveTotal",\n           i."balanceDue"::double precision AS "balanceDue"\n    FROM "Invoice" i\n''',
    "active invoice effective total query",
)
text = replace_once(
    text,
    '''    WHERE "shopId" = ${shopId}::uuid\n      AND "serviceOrderId" = ${serviceOrderId}::uuid\n      AND "deletedAt" IS NULL\n      AND "status" <> 'VOID'::"InvoiceStatus"\n    ORDER BY "issuedAt" DESC\n''',
    '''    WHERE i."shopId" = ${shopId}::uuid\n      AND i."serviceOrderId" = ${serviceOrderId}::uuid\n      AND i."deletedAt" IS NULL\n      AND i."status" <> 'VOID'::"InvoiceStatus"\n    ORDER BY i."issuedAt" DESC\n''',
    "qualified active invoice query",
)
text = text.replace('          "finalTotal" = ${invoice.total},', '          "finalTotal" = ${invoice.effectiveTotal},')
if text.count('"finalTotal" = ${invoice.effectiveTotal},') != 2:
    raise SystemExit("expected delivery and close to use effective invoice total")
delivery_path.write_text(text)
