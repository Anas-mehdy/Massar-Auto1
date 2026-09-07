"use client";

import {
  ArrowLeftRight,
  Banknote,
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  CirclePlay,
  CircleHelp,
  Code2,
  Cpu,
  Crown,
  Headphones,
  Laptop,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRound,
  WalletCards,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type NavGuard = "settings" | "reports" | "subscription" | "debts";
type NavTone = "teal" | "cyan" | "indigo" | "amber" | "sky" | "emerald" | "slate";
type NavLeaf = { href: string; label: string; icon: LucideIcon; description?: string; guard?: NavGuard; badge?: string };
type NavSection = { key: string; label: string; icon: LucideIcon; tone: NavTone; href?: string; children?: NavLeaf[] };
type NavPermissions = { canSettings: boolean; canReports: boolean; canManageSubscription: boolean; canManageDebts: boolean };

type ToneStyle = {
  active: string;
  idle: string;
  icon: string;
  border: string;
  tray: string;
  accent: string;
  childActive: string;
};

const tones: Record<NavTone, ToneStyle> = {
  teal: {
    active: "border-teal-200/90 bg-gradient-to-l from-teal-100/90 via-teal-50/85 to-white text-teal-950 shadow-[0_12px_28px_-20px_rgba(13,148,136,0.9)]",
    idle: "border-teal-100/70 bg-teal-50/45 text-slate-700 hover:border-teal-200 hover:bg-teal-50/90 hover:text-teal-950",
    icon: "bg-white/90 text-teal-700 ring-1 ring-teal-100 shadow-sm",
    border: "border-teal-100",
    tray: "border-teal-100/80 bg-teal-50/45",
    accent: "bg-teal-500",
    childActive: "border-teal-200 bg-white text-teal-900 shadow-sm",
  },
  cyan: {
    active: "border-cyan-200/90 bg-gradient-to-l from-cyan-100/90 via-cyan-50/85 to-white text-cyan-950 shadow-[0_12px_28px_-20px_rgba(8,145,178,0.9)]",
    idle: "border-cyan-100/70 bg-cyan-50/45 text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/90 hover:text-cyan-950",
    icon: "bg-white/90 text-cyan-700 ring-1 ring-cyan-100 shadow-sm",
    border: "border-cyan-100",
    tray: "border-cyan-100/80 bg-cyan-50/45",
    accent: "bg-cyan-500",
    childActive: "border-cyan-200 bg-white text-cyan-900 shadow-sm",
  },
  indigo: {
    active: "border-indigo-200/90 bg-gradient-to-l from-indigo-100/90 via-indigo-50/85 to-white text-indigo-950 shadow-[0_12px_28px_-20px_rgba(79,70,229,0.85)]",
    idle: "border-indigo-100/70 bg-indigo-50/45 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/90 hover:text-indigo-950",
    icon: "bg-white/90 text-indigo-700 ring-1 ring-indigo-100 shadow-sm",
    border: "border-indigo-100",
    tray: "border-indigo-100/80 bg-indigo-50/45",
    accent: "bg-indigo-500",
    childActive: "border-indigo-200 bg-white text-indigo-900 shadow-sm",
  },
  amber: {
    active: "border-amber-200/90 bg-gradient-to-l from-amber-100/90 via-amber-50/85 to-white text-amber-950 shadow-[0_12px_28px_-20px_rgba(217,119,6,0.8)]",
    idle: "border-amber-100/80 bg-amber-50/50 text-slate-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-950",
    icon: "bg-white/90 text-amber-700 ring-1 ring-amber-100 shadow-sm",
    border: "border-amber-100",
    tray: "border-amber-100/80 bg-amber-50/50",
    accent: "bg-amber-500",
    childActive: "border-amber-200 bg-white text-amber-900 shadow-sm",
  },
  sky: {
    active: "border-sky-200/90 bg-gradient-to-l from-sky-100/90 via-sky-50/85 to-white text-sky-950 shadow-[0_12px_28px_-20px_rgba(2,132,199,0.85)]",
    idle: "border-sky-100/70 bg-sky-50/45 text-slate-700 hover:border-sky-200 hover:bg-sky-50/90 hover:text-sky-950",
    icon: "bg-white/90 text-sky-700 ring-1 ring-sky-100 shadow-sm",
    border: "border-sky-100",
    tray: "border-sky-100/80 bg-sky-50/45",
    accent: "bg-sky-500",
    childActive: "border-sky-200 bg-white text-sky-900 shadow-sm",
  },
  emerald: {
    active: "border-emerald-200/90 bg-gradient-to-l from-emerald-100/90 via-emerald-50/85 to-white text-emerald-950 shadow-[0_12px_28px_-20px_rgba(5,150,105,0.85)]",
    idle: "border-emerald-100/70 bg-emerald-50/45 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/90 hover:text-emerald-950",
    icon: "bg-white/90 text-emerald-700 ring-1 ring-emerald-100 shadow-sm",
    border: "border-emerald-100",
    tray: "border-emerald-100/80 bg-emerald-50/45",
    accent: "bg-emerald-500",
    childActive: "border-emerald-200 bg-white text-emerald-900 shadow-sm",
  },
  slate: {
    active: "border-slate-300/90 bg-gradient-to-l from-slate-200/90 via-slate-100/85 to-white text-slate-950 shadow-[0_12px_28px_-20px_rgba(51,65,85,0.65)]",
    idle: "border-slate-200/80 bg-slate-100/60 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950",
    icon: "bg-white/90 text-slate-700 ring-1 ring-slate-200 shadow-sm",
    border: "border-slate-200",
    tray: "border-slate-200/80 bg-slate-100/65",
    accent: "bg-slate-500",
    childActive: "border-slate-300 bg-white text-slate-900 shadow-sm",
  },
};

export const navSections: NavSection[] = [
  { key: "home", label: "الرئيسية", icon: LayoutDashboard, tone: "teal", href: "/dashboard" },
  { key: "point-of-sale", label: "نقطة البيع", icon: ShoppingCart, tone: "indigo", href: "/point-of-sale" },
  { key: "repair", label: "الصيانة", icon: Wrench, tone: "cyan", href: "/repair-orders" },
  {
    key: "sales", label: "المبيعات", icon: ShoppingCart, tone: "indigo", children: [
      { href: "/sales", label: "المبيعات والـ POS", icon: ShoppingCart, description: "بيع القطع والخدمات وإدارة نقطة البيع" },
      { href: "/software-services", label: "خدمات السوفتوير", icon: Code2, description: "الخدمات الرقمية والفواتير المرتبطة بها" },
      { href: "/electronic-services", label: "الخدمات الإلكترونية", icon: Zap, description: "أرصدة المزودين والشحن والفواتير والخدمات الرقمية", badge: "جديد" },
      { href: "/online-store", label: "المتجر الإلكتروني", icon: Laptop, description: "الخدمات والمنتجات الإلكترونية", badge: "قريباً" },
    ],
  },
  {
    key: "inventory", label: "المخزون", icon: Boxes, tone: "amber", children: [
      { href: "/inventory", label: "المستودع", icon: Boxes, description: "القطع والكميات والحركات والتوالف" },
      { href: "/inventory/purchases", label: "استلام بضاعة", icon: ReceiptText, description: "فواتير المشتريات والاستلام والمرتجعات", badge: "جديد" },
      { href: "/compatibility", label: "التوافقات", icon: Cpu, description: "دليل توافق القطع والأجهزة" },
      { href: "/suppliers", label: "الموردون", icon: Truck, description: "الموردون والمشتريات وقطع الغيار" },
    ],
  },
  { key: "customers", label: "العملاء", icon: UserRound, tone: "sky", href: "/customers" },
  {
    key: "finance", label: "المالية", icon: WalletCards, tone: "emerald", children: [
      { href: "/invoices", label: "الفواتير", icon: Receipt, description: "الفواتير والتحصيلات وحالات الدفع" },
      { href: "/installments", label: "الأقساط", icon: WalletCards, description: "خطط الأقساط والدفعات المجدولة" },
      { href: "/debts", label: "دفتر الديون", icon: BookOpenText, description: "أرصدة العملاء والتحصيلات", guard: "debts" },
      { href: "/cash-drawer", label: "الدرج النقدي", icon: Banknote, description: "رصيد الكاش وحركات الدخول والخروج" },
      { href: "/transfers", label: "المحافظ والتحويلات", icon: ArrowLeftRight, description: "المحافظ الإلكترونية وحركة التحويلات" },
      { href: "/reports", label: "التقارير والأرباح", icon: ChartNoAxesCombined, description: "ملخص الأداء المالي والسيولة", guard: "reports" },
    ],
  },
  {
    key: "admin", label: "الإدارة", icon: Settings, tone: "slate", children: [
      { href: "/settings", label: "إعدادات المتجر", icon: Settings, description: "بيانات المتجر والتفضيلات", guard: "settings" },
      { href: "/subscription", label: "الاشتراك", icon: Crown, description: "الخطة والمدة وبيانات الاشتراك", guard: "subscription" },
      { href: "/account/security", label: "أمان الحساب", icon: ShieldCheck, description: "كلمة المرور وإعدادات الأمان", guard: "settings" },
      { href: "/help", label: "مركز المساعدة", icon: CircleHelp, description: "إجابات قصيرة مرتبطة بكل قسم" },
      { href: "/tutorial", label: "شرح مسار", icon: CirclePlay, description: "فيديوهات وأساسيات الاستخدام" },
      { href: "/support", label: "الدعم الفني", icon: Headphones, description: "المساعدة والتواصل عبر واتساب" },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
function canShow(item: NavLeaf, p: NavPermissions) {
  if (item.guard === "settings") return p.canSettings;
  if (item.guard === "reports") return p.canReports;
  if (item.guard === "subscription") return p.canManageSubscription;
  if (item.guard === "debts") return p.canManageDebts;
  return true;
}
function visibleChildren(section: NavSection, p: NavPermissions) { return (section.children ?? []).filter((item) => canShow(item, p)); }
function sectionActive(section: NavSection, pathname: string, p: NavPermissions) {
  return section.href ? isActivePath(pathname, section.href) : visibleChildren(section, p).some((item) => isActivePath(pathname, item.href));
}

export function navigationLabelForPath(pathname: string) {
  for (const section of navSections) {
    if (section.href && isActivePath(pathname, section.href)) return section.label;
    const child = section.children?.find((item) => isActivePath(pathname, item.href));
    if (child) return child.label;
  }
  return "مسار";
}

export function AppNav({ onNavigate, canSettings = false, canReports = false, canManageSubscription = false, canManageDebts = false, compact = false }: {
  onNavigate?: () => void; compact?: boolean; canSettings?: boolean; canReports?: boolean; canManageSubscription?: boolean; canManageDebts?: boolean;
}) {
  const pathname = usePathname();
  const permissions = useMemo(() => ({ canSettings, canReports, canManageSubscription, canManageDebts }), [canSettings, canReports, canManageSubscription, canManageDebts]);
  const activeParent = navSections.find((section) => section.children && sectionActive(section, pathname, permissions));
  const [expanded, setExpanded] = useState<string | null>(activeParent?.key ?? null);
  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    const next = navSections.find((section) => section.children && sectionActive(section, pathname, permissions));
    if (next) setExpanded(next.key);
    setPinned(null);
  }, [pathname, permissions]);

  return <nav aria-label="التنقل الرئيسي" className={cn("mt-3", compact ? "space-y-1" : "space-y-1.5")}>
    {navSections.map((section) => {
      const children = visibleChildren(section, permissions);
      if (!section.href && !children.length) return null;
      const active = sectionActive(section, pathname, permissions);
      const palette = tones[section.tone];
      const Icon = section.icon;

      if (compact && section.href) {
        return <Link key={section.key} href={section.href} onClick={onNavigate} title={section.label} aria-current={active ? "page" : undefined} className={cn("group relative mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] border transition-all duration-200", active ? palette.active : palette.idle)}><Icon className={cn("h-[18px] w-[18px] transition-transform group-hover:scale-105", active && "stroke-[2.35]")} />{active && <span className={cn("absolute -right-[7px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full shadow-sm", palette.accent)} />}</Link>;
      }

      if (compact) {
        const isPinned = pinned === section.key;
        return <div key={section.key} className="group relative mx-auto w-10">
          <button type="button" title={section.label} aria-expanded={isPinned} onClick={() => setPinned((value) => value === section.key ? null : section.key)} className={cn("relative flex h-10 w-10 items-center justify-center rounded-[14px] border transition-all duration-200", active ? palette.active : palette.idle)}><Icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.35]")} /><ChevronLeft className="absolute -left-1.5 h-3 w-3 rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200" />{active && <span className={cn("absolute -right-[7px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full", palette.accent)} />}</button>
          <div className={cn("absolute right-full top-0 z-[70] mr-3 w-[284px] overflow-hidden rounded-[20px] border bg-white/95 p-2.5 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.4)] backdrop-blur-xl", palette.border, isPinned ? "block" : "hidden group-hover:block group-focus-within:block")}>
            <div className={cn("mb-2 flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5", palette.tray)}><span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", palette.icon)}><Icon className="h-4 w-4" /></span><div><p className="text-[13px] font-black text-slate-900">{section.label}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-400">اختر الوجهة المطلوبة</p></div></div>
            <div className="space-y-1">{children.map((item) => <ChildLink key={item.href} item={item} active={isActivePath(pathname, item.href)} tone={section.tone} flyout onNavigate={() => { setPinned(null); onNavigate?.(); }} />)}</div>
          </div>
        </div>;
      }

      if (section.href) {
        return <Link key={section.key} href={section.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("group relative flex min-h-[42px] items-center gap-2.5 rounded-[15px] border px-2.5 py-1.5 text-[13px] font-extrabold transition-all duration-200", active ? palette.active : palette.idle)}><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] transition-transform group-hover:scale-[1.03]", palette.icon)}><Icon className="h-4 w-4" /></span><span className="flex-1">{section.label}</span>{active && <span className={cn("absolute inset-y-2 right-0 w-[3px] rounded-l-full", palette.accent)} />}</Link>;
      }

      const open = expanded === section.key;
      return <div key={section.key} className="space-y-1">
        <button type="button" aria-expanded={open} onClick={() => setExpanded((value) => value === section.key ? null : section.key)} className={cn("group relative flex min-h-[42px] w-full items-center gap-2.5 rounded-[15px] border px-2.5 py-1.5 text-right text-[13px] font-extrabold transition-all duration-200", active ? palette.active : palette.idle)}><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] transition-transform group-hover:scale-[1.03]", palette.icon)}><Icon className="h-4 w-4" /></span><span className="flex-1">{section.label}</span><span className={cn("flex h-6 w-6 items-center justify-center rounded-lg bg-white/75 text-slate-400 ring-1 ring-black/[0.04] transition", open && "text-slate-700")}><ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} /></span>{active && <span className={cn("absolute inset-y-2 right-0 w-[3px] rounded-l-full", palette.accent)} />}</button>
        {open && <div className={cn("mx-1 rounded-[16px] border p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]", palette.tray)}><div className="space-y-1">{children.map((item) => <ChildLink key={item.href} item={item} active={isActivePath(pathname, item.href)} tone={section.tone} onNavigate={onNavigate} />)}</div></div>}
      </div>;
    })}
  </nav>;
}

function ChildLink({ item, active, tone, onNavigate, flyout = false }: { item: NavLeaf; active: boolean; tone: NavTone; onNavigate?: () => void; flyout?: boolean }) {
  const Icon = item.icon;
  const palette = tones[tone];
  return <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("group flex items-center gap-2 rounded-[12px] border transition-all duration-150", flyout ? "px-2.5 py-2" : "px-2 py-1.5", active ? palette.childActive : "border-transparent bg-white/45 text-slate-600 hover:border-white hover:bg-white/90 hover:text-slate-950 hover:shadow-sm")}><span className={cn("flex shrink-0 items-center justify-center rounded-lg", flyout ? "h-8 w-8" : "h-7 w-7", active ? palette.icon : "bg-white/80 text-slate-400 ring-1 ring-slate-200/70")}><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className={cn("flex items-center gap-2 font-bold", flyout ? "text-[12.5px]" : "text-[11.5px]")}><span className="truncate">{item.label}</span>{item.badge && <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[8px] font-black text-orange-600">{item.badge}</span>}</span>{flyout && item.description && <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">{item.description}</span>}</span></Link>;
}

type MobileSheet = "sales" | "more" | null;
export function MobileBottomNav({ canSettings = false, canReports = false, canManageSubscription = false, canManageDebts = false }: { canSettings?: boolean; canReports?: boolean; canManageSubscription?: boolean; canManageDebts?: boolean }) {
  const pathname = usePathname();
  const permissions = useMemo(() => ({ canSettings, canReports, canManageSubscription, canManageDebts }), [canSettings, canReports, canManageSubscription, canManageDebts]);
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const activeKey = navSections.find((section) => sectionActive(section, pathname, permissions))?.key;
  useEffect(() => { setSheet(null); }, [pathname]);
  useEffect(() => { if (!sheet) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [sheet]);
  const byKey = (key: string) => navSections.find((section) => section.key === key)!;
  const moreActive = ["inventory", "customers", "finance", "admin"].includes(activeKey ?? "");
  return <>
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-gradient-to-t from-white via-white/98 to-slate-50/95 shadow-[0_-16px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="grid h-[68px] grid-cols-5 px-1.5"><MobileDirectTab section={byKey("home")} active={activeKey === "home"} /><MobileDirectTab section={byKey("point-of-sale")} active={activeKey === "point-of-sale"} /><MobileDirectTab section={byKey("repair")} active={activeKey === "repair"} /><MobileSheetTab section={byKey("sales")} active={activeKey === "sales"} onClick={() => setSheet("sales")} /><button type="button" onClick={() => setSheet("more")} className={cn("relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black", moreActive ? "text-teal-700" : "text-slate-500")}><span className={cn("flex h-8 w-9 items-center justify-center rounded-xl", moreActive ? "bg-teal-50 shadow-sm ring-1 ring-teal-100" : "bg-slate-50/70")}><MoreHorizontal className="h-5 w-5" /></span><span>المزيد</span>{moreActive && <span className="absolute bottom-1 h-1 w-5 rounded-full bg-teal-500" />}</button></div></div>
    {sheet && <><button type="button" aria-label="إغلاق القائمة" onClick={() => setSheet(null)} className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-[2px] lg:hidden" /><section className="fixed inset-x-0 bottom-0 z-[70] max-h-[78vh] overflow-hidden rounded-t-[28px] border-t border-slate-200 bg-white shadow-2xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200" /><div className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 pt-3"><div><p className="text-[15px] font-black text-slate-900">{sheet === "sales" ? "المبيعات" : "المزيد"}</p><p className="text-[11px] font-semibold text-slate-400">{sheet === "more" ? "الوصول السريع لبقية أقسام مسار" : "اختر الصفحة التي تريد فتحها"}</p></div><button type="button" onClick={() => setSheet(null)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500"><X className="h-4 w-4" /></button></div><div className="max-h-[calc(78vh-92px)] overflow-y-auto px-4 py-4">{sheet === "sales" && <MobileGroup title="المبيعات" section={byKey("sales")} pathname={pathname} permissions={permissions} close={() => setSheet(null)} />}{sheet === "more" && <div className="space-y-5"><MobileGroup title="المخزون" section={byKey("inventory")} pathname={pathname} permissions={permissions} close={() => setSheet(null)} /><MobileDirectCard section={byKey("customers")} active={activeKey === "customers"} close={() => setSheet(null)} /><MobileGroup title="المالية" section={byKey("finance")} pathname={pathname} permissions={permissions} close={() => setSheet(null)} /><MobileGroup title="الإدارة والمساعدة" section={byKey("admin")} pathname={pathname} permissions={permissions} close={() => setSheet(null)} /></div>}</div></section></>}
  </>;
}

function MobileDirectTab({ section, active }: { section: NavSection; active: boolean }) { const Icon = section.icon; return <Link href={section.href!} className={cn("relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black", active ? "text-teal-700" : "text-slate-500")}><span className={cn("flex h-8 w-9 items-center justify-center rounded-xl", active ? "bg-teal-50 shadow-sm ring-1 ring-teal-100" : "bg-slate-50/70")}><Icon className="h-[18px] w-[18px]" /></span><span>{section.label}</span>{active && <span className="absolute bottom-1 h-1 w-5 rounded-full bg-teal-500" />}</Link>; }
function MobileSheetTab({ section, active, onClick }: { section: NavSection; active: boolean; onClick: () => void }) { const Icon = section.icon; return <button type="button" onClick={onClick} className={cn("relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black", active ? "text-teal-700" : "text-slate-500")}><span className={cn("flex h-8 w-9 items-center justify-center rounded-xl", active ? "bg-teal-50 shadow-sm ring-1 ring-teal-100" : "bg-slate-50/70")}><Icon className="h-[18px] w-[18px]" /></span><span>{section.label}</span>{active && <span className="absolute bottom-1 h-1 w-5 rounded-full bg-teal-500" />}</button>; }
function MobileGroup({ title, section, pathname, permissions, close }: { title: string; section: NavSection; pathname: string; permissions: NavPermissions; close: () => void }) { const children = visibleChildren(section, permissions); const palette = tones[section.tone]; return <div><h3 className="mb-2.5 px-1 text-[12px] font-black text-slate-500">{title}</h3><div className="grid gap-2 sm:grid-cols-2">{children.map((item) => { const Icon = item.icon; const active = isActivePath(pathname, item.href); return <Link key={item.href} href={item.href} onClick={close} className={cn("flex min-h-[60px] items-center gap-3 rounded-2xl border p-3 transition-all", active ? palette.active : palette.idle)}><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", palette.icon)}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[13px] font-black"><span className="truncate">{item.label}</span>{item.badge && <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[9px] text-orange-600">{item.badge}</span>}</span>{item.description && <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400">{item.description}</span>}</span></Link>; })}</div></div>; }
function MobileDirectCard({ section, active, close }: { section: NavSection; active: boolean; close: () => void }) { const Icon = section.icon; const palette = tones[section.tone]; return <Link href={section.href!} onClick={close} className={cn("flex min-h-[60px] items-center gap-3 rounded-2xl border p-3", active ? palette.active : palette.idle)}><span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", palette.icon)}><Icon className="h-4 w-4" /></span><div><p className="text-[13px] font-black">{section.label}</p><p className="text-[10px] font-semibold text-slate-400">إدارة بيانات العملاء وسجلهم</p></div></Link>; }
