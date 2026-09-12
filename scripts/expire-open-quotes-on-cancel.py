from pathlib import Path

path = Path("lib/services/autoServiceOrderService.ts")
text = path.read_text()

old = '''    if (toStatus === "CANCELLED" || toStatus === "REJECTED") {\n      await releaseServiceOrderReservationsInTx(tx, shopId, serviceOrderId);\n    }\n'''
new = '''    if (toStatus === "CANCELLED" || toStatus === "REJECTED") {\n      await releaseServiceOrderReservationsInTx(tx, shopId, serviceOrderId);\n    }\n\n    if (toStatus === "CANCELLED") {\n      await tx.quotation.updateMany({\n        where: {\n          shopId,\n          serviceOrderId,\n          status: { in: ["DRAFT", "SENT"] },\n        },\n        data: { status: "EXPIRED", updatedAt: new Date() },\n      });\n    }\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"cancel branch anchor mismatch: {count}")

path.write_text(text.replace(old, new, 1))
