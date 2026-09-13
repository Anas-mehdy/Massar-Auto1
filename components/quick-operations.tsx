"use client";

import {
  ArrowLeftRight,
  ArrowRight,
  BookOpenText,
  Boxes,
  Code2,
  MoreHorizontal,
  Plus,
  ShoppingCart,
  Sparkles,
  UserPlus,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AppPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import styles from "./quick-operations.module.css";

type Tone = "cyan" | "indigo" | "violet" | "amber" | "sky" | "emerald" | "rose";

type QuickOperation = {
  key: string;
  label: string;
  description: string;
  href?: string;
  icon: LucideIcon;
  tone: Tone;
  permission: AppPermission;
  comingSoon?: boolean;
};

const primaryOperations: QuickOperation[] = [
  {
    key: "service",
    label: "أمر صيانة جديد",
    description: "استقبال مركبة وفتح أمر صيانة",
    href: "/point-of-sale?tab=service",
    icon: Wrench,
    tone: "cyan",
    permission: "service_orders:create",
  },
  {
    key: "pos",
    label: "بيع POS",
    description: "بيع قطعة أو خدمة سريعة من نقطة البيع",
    href: "/point-of-sale?tab=sale",
    icon: ShoppingCart,
    tone: "indigo",
    permission: "sales:create",
  },
  {
    key: "software",
    label: "خدمة سوفتوير",
    description: "تسجيل خدمة سوفتوير جديدة",
    href: "/point-of-sale?tab=software",
    icon: Code2,
    tone: "violet",
    permission: "sales:create",
  },
  {
    key: "electronic-service",
    label: "خدمة إلكترونية",
    description: "شحن وفواتير وخدمات مزودي الرصيد",
    href: "/point-of-sale?tab=electronic",
    icon: Zap,
    tone: "amber",
    permission: "electronic_services:execute",
  },
];

const secondaryOperations: QuickOperation[] = [
  {
    key: "customer",
    label: "عميل جديد",
    description: "إضافة عميل إلى سجل العملاء",
    href: "/customers/new",
    icon: UserPlus,
    tone: "sky",
    permission: "customers:manage",
  },
  {
    key: "inventory",
    label: "إضافة للمستودع",
    description: "إضافة صنف أو قطعة جديدة",
    href: "/inventory/new",
    icon: Boxes,
    tone: "amber",
    permission: "inventory:manage",
  },
  {
    key: "debt",
    label: "دين أو تحصيل",
    description: "فتح دفتر الديون لتسجيل حركة",
    href: "/debts",
    icon: BookOpenText,
    tone: "rose",
    permission: "debts:manage",
  },
  {
    key: "transfer",
    label: "تحويل مالي",
    description: "فتح المحافظ والتحويلات",
    href: "/transfers",
    icon: ArrowLeftRight,
    tone: "emerald",
    permission: "sales:create",
  },
];

const toneClasses: Record<Tone, { icon: string; circle: string; soft: string }> = {
  cyan: {
    icon: "text-cyan-700 dark:text-cyan-300",
    circle: "border-cyan-200 bg-cyan-50 dark:border-cyan-900/80 dark:bg-cyan-950/55",
    soft: "hover:border-cyan-300 hover:bg-cyan-50 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/45",
  },
  indigo: {
    icon: "text-indigo-700 dark:text-indigo-300",
    circle: "border-indigo-200 bg-indigo-50 dark:border-indigo-900/80 dark:bg-indigo-950/55",
    soft: "hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/45",
  },
  violet: {
    icon: "text-violet-700 dark:text-violet-300",
    circle: "border-violet-200 bg-violet-50 dark:border-violet-900/80 dark:bg-violet-950/55",
    soft: "hover:border-violet-300 hover:bg-violet-50 dark:hover:border-violet-800 dark:hover:bg-violet-950/45",
  },
  amber: {
    icon: "text-amber-700 dark:text-amber-300",
    circle: "border-amber-200 bg-amber-50 dark:border-amber-900/80 dark:bg-amber-950/55",
    soft: "hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-800 dark:hover:bg-amber-950/45",
  },
  sky: {
    icon: "text-sky-700 dark:text-sky-300",
    circle: "border-sky-200 bg-sky-50 dark:border-sky-900/80 dark:bg-sky-950/55",
    soft: "hover:border-sky-300 hover:bg-sky-50 dark:hover:border-sky-800 dark:hover:bg-sky-950/45",
  },
  emerald: {
    icon: "text-emerald-700 dark:text-emerald-300",
    circle: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/80 dark:bg-emerald-950/55",
    soft: "hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/45",
  },
  rose: {
    icon: "text-rose-700 dark:text-rose-300",
    circle: "border-rose-200 bg-rose-50 dark:border-rose-900/80 dark:bg-rose-950/55",
    soft: "hover:border-rose-300 hover:bg-rose-50 dark:hover:border-rose-800 dark:hover:bg-rose-950/45",
  },
};

function isHiddenPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/onboarding" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/partners") ||
    pathname.startsWith("/partner-invite/") ||
    pathname.startsWith("/register/partner/") ||
    pathname.includes("/print") ||
    pathname.includes("/sticker") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/installment-track")
  );
}

export function QuickOperationsLauncher({
  permissions = [],
  readOnly = false,
}: {
  permissions?: readonly AppPermission[];
  readOnly?: boolean;
}) {
  const pathname = usePathname();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const primary = useMemo(
    () => primaryOperations.filter((operation) => permissions.includes(operation.permission)),
    [permissions],
  );
  const secondary = useMemo(
    () => secondaryOperations.filter((operation) => permissions.includes(operation.permission)),
    [permissions],
  );

  useEffect(() => {
    setDesktopOpen(false);
    setShowMore(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDesktopOpen(false);
      setShowMore(false);
      setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  if (isHiddenPath(pathname) || (primary.length === 0 && secondary.length === 0)) return null;

  const canShowMore = primary.length > 0 && secondary.length > 0;
  const desktopOperations = showMore && canShowMore ? secondary : primary.length > 0 ? primary : secondary;

  return (
    <>
      {desktopOpen ? (
        <button
          type="button"
          aria-label="إغلاق مركز العمليات"
          className="fixed inset-0 z-[53] hidden bg-transparent lg:block"
          onClick={() => {
            setDesktopOpen(false);
            setShowMore(false);
          }}
        />
      ) : null}

      <div className={styles.desktopRoot} dir="ltr">
        {desktopOpen ? (
          <div className={styles.desktopMenu}>
            {desktopOperations.map((operation, index) => (
              <DesktopOperation
                key={operation.key}
                operation={operation}
                readOnly={readOnly}
                delay={index * 45}
                onNavigate={() => {
                  setDesktopOpen(false);
                  setShowMore(false);
                }}
              />
            ))}

            {canShowMore ? (
              <button
                type="button"
                className={styles.desktopActionRow}
                style={{ animationDelay: `${desktopOperations.length * 45}ms` }}
                onClick={() => setShowMore((value) => !value)}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:shadow-black/30 dark:hover:border-teal-700 dark:hover:text-teal-300">
                  {showMore ? <ArrowRight className="h-4.5 w-4.5" /> : <MoreHorizontal className="h-5 w-5" />}
                </span>
                <span className={styles.desktopActionLabel} dir="rtl">
                  {showMore ? "العودة للعمليات الأساسية" : "المزيد من العمليات"}
                </span>
              </button>
            ) : null}
          </div>
        ) : null}

        {!desktopOpen ? (
          <div className={styles.floatingLabel} dir="rtl">
            <Sparkles className="h-3.5 w-3.5 text-teal-500" />
            <span>عملية جديدة</span>
          </div>
        ) : null}

        <button
          type="button"
          aria-expanded={desktopOpen}
          aria-label={desktopOpen ? "إغلاق العمليات السريعة" : "عملية جديدة"}
          title="عملية جديدة"
          onClick={() => {
            setDesktopOpen((value) => !value);
            if (desktopOpen) setShowMore(false);
          }}
          className={styles.desktopMainButton}
        >
          <Plus className={cn("h-6 w-6 transition-transform duration-300", desktopOpen && "rotate-45")} />
        </button>
      </div>

      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-label="عملية جديدة"
        onClick={() => setMobileOpen(true)}
        className={styles.mobileTrigger}
      >
        <Plus className="h-6 w-6" />
        <span className="sr-only">عملية جديدة</span>
      </button>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="إغلاق مركز العمليات"
            className="fixed inset-0 z-[75] bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <section className={styles.mobileSheet} dir="rtl" aria-label="مركز العمليات">
            <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-3 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-600/20">
                    <Plus className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-[16px] font-black text-slate-950 dark:text-slate-50">عملية جديدة</h2>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-400">اختر العملية التي تريد تنفيذها الآن</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(78vh-86px)] overflow-y-auto px-4 pb-7 pt-4">
              {readOnly ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200">
                  الاشتراك حالياً بوضع القراءة فقط، لذلك إنشاء عمليات جديدة متوقف مؤقتاً.
                </div>
              ) : null}

              {primary.length > 0 ? (
                <>
                  <p className="mb-2.5 px-1 text-[11px] font-black text-slate-500 dark:text-slate-400">العمليات الأساسية</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {primary.map((operation) => (
                      <MobileOperation
                        key={operation.key}
                        operation={operation}
                        readOnly={readOnly}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {primary.length > 0 && secondary.length > 0 ? <div className="my-4 h-px bg-slate-100 dark:bg-slate-800" /> : null}
              {secondary.length > 0 ? (
                <>
                  <p className="mb-2.5 px-1 text-[11px] font-black text-slate-500 dark:text-slate-400">عمليات أخرى</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {secondary.map((operation) => (
                      <MobileOperation
                        key={operation.key}
                        operation={operation}
                        readOnly={readOnly}
                        compact
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function DesktopOperation({
  operation,
  readOnly,
  delay,
  onNavigate,
}: {
  operation: QuickOperation;
  readOnly: boolean;
  delay: number;
  onNavigate: () => void;
}) {
  const Icon = operation.icon;
  const palette = toneClasses[operation.tone];
  const disabled = readOnly || operation.comingSoon || !operation.href;

  const content = (
    <>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-lg shadow-slate-950/10 transition", palette.circle, palette.icon, !disabled && "hover:-translate-y-0.5", disabled && "opacity-65")}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className={styles.desktopActionLabel} dir="rtl">
        <span>{operation.label}</span>
        {operation.comingSoon ? <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">قريباً</span> : null}
      </span>
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={cn(styles.desktopActionRow, "cursor-not-allowed")}
        style={{ animationDelay: `${delay}ms` }}
        title={readOnly ? "الاشتراك بوضع القراءة فقط" : "قريباً"}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={operation.href!}
      onClick={onNavigate}
      className={styles.desktopActionRow}
      style={{ animationDelay: `${delay}ms` }}
    >
      {content}
    </Link>
  );
}

function MobileOperation({
  operation,
  readOnly,
  compact = false,
  onNavigate,
}: {
  operation: QuickOperation;
  readOnly: boolean;
  compact?: boolean;
  onNavigate: () => void;
}) {
  const Icon = operation.icon;
  const palette = toneClasses[operation.tone];
  const disabled = readOnly || operation.comingSoon || !operation.href;
  const className = cn(
    "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white text-right shadow-sm transition dark:border-slate-800 dark:bg-slate-900/85",
    compact ? "min-h-[62px] p-3" : "min-h-[92px] flex-col items-start p-3.5",
    !disabled && palette.soft,
    disabled && "cursor-not-allowed opacity-65",
  );

  const content = (
    <>
      <span className={cn("flex shrink-0 items-center justify-center rounded-xl border", compact ? "h-9 w-9" : "h-10 w-10", palette.circle, palette.icon)}>
        <Icon className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-black text-slate-900 dark:text-slate-100">
          <span>{operation.label}</span>
          {operation.comingSoon ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">قريباً</span> : null}
        </span>
        <span className="mt-1 block text-[9.5px] font-semibold leading-4 text-slate-400">{operation.description}</span>
      </span>
    </>
  );

  if (disabled) {
    return <button type="button" disabled className={className}>{content}</button>;
  }

  return <Link href={operation.href!} onClick={onNavigate} className={className}>{content}</Link>;
}
