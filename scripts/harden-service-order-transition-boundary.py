from pathlib import Path

path = Path("lib/services/autoServiceOrderService.ts")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    '  READY_FOR_DELIVERY: ["DELIVERED", "IN_SERVICE"],\n  DELIVERED: ["CLOSED"],',
    '  READY_FOR_DELIVERY: ["IN_SERVICE"],\n  DELIVERED: [],',
    "dedicated delivery/close transitions",
)

replace_once(
    '''    if (current.status === toStatus) return current;\n\n    if (!ALLOWED_TRANSITIONS[current.status]?.includes(toStatus)) {\n      throw new Error(`لا يمكن نقل أمر الصيانة من ${current.status} إلى ${toStatus}.`);\n    }\n\n    let effectiveStatus: ServiceOrderStatus = toStatus;''',
    '''    if (current.status === toStatus) return current;\n\n    if (toStatus === "DELIVERED" || toStatus === "CLOSED") {\n      throw new Error("استخدم إجراء تسليم المركبة أو إغلاق أمر الصيانة المخصص لضمان الفاتورة وسجل التدقيق.");\n    }\n\n    if (!ALLOWED_TRANSITIONS[current.status]?.includes(toStatus)) {\n      throw new Error(`لا يمكن نقل أمر الصيانة من ${current.status} إلى ${toStatus}.`);\n    }\n\n    if (!["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"].includes(toStatus)) {\n      const activeInvoice = await tx.invoice.findFirst({\n        where: {\n          shopId,\n          serviceOrderId,\n          deletedAt: null,\n          status: { not: "VOID" },\n        },\n        select: { id: true },\n      });\n      if (activeInvoice) {\n        throw new Error("لا يمكن إعادة أمر الصيانة إلى مرحلة تنفيذية أو إلغائه مع وجود فاتورة فعالة. ألغِ الفاتورة أولاً ثم أعد فتح العمل.");\n      }\n    }\n\n    let effectiveStatus: ServiceOrderStatus = toStatus;''',
    "service-level invoice lifecycle guard",
)

path.write_text(text)
