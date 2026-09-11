import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  RECEIVED: "تم الاستلام",
  INSPECTING: "قيد الفحص",
  WAITING_CUSTOMER_APPROVAL: "بانتظار موافقة العميل",
  APPROVED: "تمت الموافقة",
  IN_SERVICE: "قيد الصيانة",
  WAITING_PARTS: "بانتظار قطع",
  READY_FOR_DELIVERY: "جاهزة للتسليم",
  DELIVERED: "تم التسليم",
  CLOSED: "مغلق",
  REJECTED: "مرفوض من العميل",
  CANCELLED: "ملغى",
};

export const SERVICE_ORDER_STATUS_CLASSES: Record<ServiceOrderStatus, string> = {
  RECEIVED: "border-sky-200 bg-sky-50 text-sky-800",
  INSPECTING: "border-cyan-200 bg-cyan-50 text-cyan-800",
  WAITING_CUSTOMER_APPROVAL: "border-amber-200 bg-amber-50 text-amber-900",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  IN_SERVICE: "border-indigo-200 bg-indigo-50 text-indigo-800",
  WAITING_PARTS: "border-orange-200 bg-orange-50 text-orange-800",
  READY_FOR_DELIVERY: "border-teal-200 bg-teal-50 text-teal-800",
  DELIVERED: "border-violet-200 bg-violet-50 text-violet-800",
  CLOSED: "border-slate-200 bg-slate-100 text-slate-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-800",
  CANCELLED: "border-red-200 bg-red-50 text-red-800",
};

export const SERVICE_ORDER_ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  RECEIVED: ["INSPECTING", "CANCELLED"],
  INSPECTING: ["WAITING_CUSTOMER_APPROVAL", "APPROVED", "IN_SERVICE", "CANCELLED"],
  WAITING_CUSTOMER_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IN_SERVICE", "WAITING_PARTS", "CANCELLED"],
  IN_SERVICE: ["WAITING_PARTS", "READY_FOR_DELIVERY", "CANCELLED"],
  WAITING_PARTS: ["IN_SERVICE", "READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["IN_SERVICE"],
  DELIVERED: [],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function formatAutoDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAutoMoney(value: string | number | null | undefined, currency: string) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("ar", {
    style: "currency",
    currency: currency || "SAR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}
