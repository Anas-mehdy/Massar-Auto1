"use client";

import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNav, MobileBottomNav, navigationLabelForPath } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/actions/authActions";
import { cn } from "@/lib/utils";
import { UserPresenceHeartbeat } from "@/components/user-presence-heartbeat";
import { GlobalSubscriptionBanner } from "@/components/subscription/global-subscription-banner";
import { TutorialOnboarding } from "@/components/tutorial-onboarding";
import { ContextualHelp } from "@/components/help/contextual-help";
import { clearAnalyticsSession } from "@/lib/analytics/client";
import type { AppPermission } from "@/lib/auth/permissions";

export function AppShell({
  children,
  permissions = [],
  canManageSubscription = false,
  subscriptionReadOnly = false,
  tutorialInitialShowBanner = false,
}: {
  children: ReactNode;
  permissions?: AppPermission[];
  canManageSubscription?: boolean;
  subscriptionReadOnly?: boolean;
  tutorialInitialShowBanner?: boolean;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("phone_repair_sidebar_collapsed");
      if (saved !== null) setIsCollapsed(saved === "true");
    } catch {
      // ignore storage access errors
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem("phone_repair_sidebar_collapsed", String(next));
      } catch {
        // ignore storage access errors
      }
      return next;
    });
  };

  const clearAnalyticsBeforeLogout = () => {
    clearAnalyticsSession();
  };

  const isPublicPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/onboarding" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/partners") ||
    pathname.startsWith("/partner-invite/") ||
    pathname.startsWith("/register/partner/") ||
    pathname.includes("/print") ||
    pathname.includes("/sticker") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/installment-track");

  if (isPublicPage) return <>{children}</>;

  const navPermissions = { permissions, canManageSubscription };
  const currentPageLabel = navigationLabelForPath(pathname);
  const readOnlyUiExempt =
    pathname.startsWith("/subscription") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/help") ||
    pathname.startsWith("/account/security");
  const enforceReadOnlyUi = subscriptionReadOnly && !readOnlyUiExempt;

  return (
    <div className={cn("masar-shell min-h-screen bg-background text-foreground transition-colors duration-300", enforceReadOnlyUi && "subscription-read-only")}>
      {enforceReadOnlyUi ? (
        <style>{`
          .subscription-read-only main form[method="post"] input:not([type="hidden"]),
          .subscription-read-only main form[method="post"] select,
          .subscription-read-only main form[method="post"] textarea,
          .subscription-read-only main form[method="post"] button[type="submit"],
          .subscription-read-only main form[method="post"] input[type="submit"] {
            pointer-events: none !important;
            opacity: .52 !important;
            cursor: not-allowed !important;
          }
          .subscription-read-only main a[href$="/new"],
          .subscription-read-only main a[href*="/new?"],
          .subscription-read-only main a[href$="/edit"],
          .subscription-read-only main a[href*="/edit?"] {
            pointer-events: none !important;
            opacity: .45 !important;
            cursor: not-allowed !important;
            filter: grayscale(.2);
          }
        `}</style>
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 hidden overflow-visible border-l border-slate-200/80 bg-gradient-to-b from-white via-slate-50/85 to-teal-50/55 shadow-[0_0_60px_-38px_rgba(15,23,42,0.38)] backdrop-blur-xl transition-[width,padding,background-color,border-color] duration-300 ease-out lg:flex lg:flex-col dark:border-slate-800/90 dark:from-slate-950 dark:via-slate-950/95 dark:to-teal-950/25 dark:shadow-[0_0_70px_-36px_rgba(0,0,0,0.9)]",
          isCollapsed ? "w-[78px] px-2.5 py-3.5" : "w-[268px] px-3 py-3.5",
        )}
        aria-label="القائمة الرئيسية"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cyan-50/60 via-teal-50/20 to-transparent dark:from-cyan-950/20 dark:via-teal-950/10" />
        <div className={cn("relative z-10 flex min-h-0 flex-1 flex-col", isCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden pr-0.5")}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={toggleSidebar}
                title="توسيع القائمة"
                aria-label="توسيع القائمة الجانبية"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-xl border border-teal-100 bg-white/85 text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 active:translate-y-0 dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-300 dark:hover:border-teal-800 dark:hover:bg-teal-950/50 dark:hover:text-teal-300"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleSidebar}
                title="مسار - منظومة إدارة الصيانة"
                className="flex h-[42px] w-[42px] items-center justify-center rounded-[15px] border border-cyan-100 bg-gradient-to-br from-white to-cyan-50 p-2 shadow-[0_10px_24px_-18px_rgba(8,145,178,0.75)] transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md active:translate-y-0 dark:border-slate-700 dark:from-slate-900 dark:to-cyan-950/45 dark:hover:border-teal-800"
              >
                <Image src="/masar-icon.png" alt="مسار" width={27} height={27} className="h-[26px] w-[26px] object-contain" />
              </button>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[18px] border border-teal-100/80 bg-gradient-to-l from-white via-cyan-50/65 to-teal-50/75 p-2.5 shadow-[0_14px_34px_-24px_rgba(13,148,136,0.8)] dark:border-slate-800 dark:from-slate-900 dark:via-cyan-950/25 dark:to-teal-950/35 dark:shadow-[0_14px_34px_-24px_rgba(0,0,0,0.9)]">
              <div aria-hidden className="absolute -left-8 -top-10 h-20 w-20 rounded-full bg-cyan-200/30 blur-2xl dark:bg-cyan-700/15" />
              <div className="relative flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white bg-white/90 p-2 shadow-sm ring-1 ring-teal-100/70 dark:border-slate-700 dark:bg-slate-950/80 dark:ring-teal-900/70">
                    <Image src="/masar-icon.png" alt="مسار" width={26} height={26} className="h-[26px] w-[26px] object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-[15px] font-black tracking-tight text-slate-950 dark:text-slate-50">مسار</h1>
                    <p className="mt-0.5 truncate text-[9.5px] font-bold text-teal-700 dark:text-teal-300">إدارة الصيانة والأعمال</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  title="طي القائمة"
                  aria-label="طي القائمة الجانبية"
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-white/80 bg-white/70 text-slate-400 shadow-sm transition-all hover:border-slate-200 hover:bg-white hover:text-slate-700 active:scale-95 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className={cn("flex-1", isCollapsed ? "overflow-visible" : "min-h-0")}>
            <AppNav {...navPermissions} compact={isCollapsed} />
          </div>

          <div className={cn("mt-auto border-t border-slate-200/70 pt-2.5 dark:border-slate-800/80", isCollapsed ? "flex flex-col items-center gap-2" : "space-y-2")}>
            <ThemeToggle compact={isCollapsed} />
            <form action={logoutAction} className={cn(!isCollapsed && "w-full")}>
              <button
                type="submit"
                onClick={clearAnalyticsBeforeLogout}
                title="تسجيل الخروج"
                className={cn(
                  "flex items-center rounded-[13px] border border-transparent font-bold text-slate-500 transition-all hover:border-rose-100 hover:bg-rose-50/80 hover:text-rose-600 active:scale-[0.98] dark:text-slate-400 dark:hover:border-rose-900/70 dark:hover:bg-rose-950/35 dark:hover:text-rose-300",
                  isCollapsed ? "h-[38px] w-[38px] justify-center" : "min-h-[38px] w-full gap-2.5 px-2.5 text-[11.5px]",
                )}
              >
                <LogOut className="h-4 w-4" />
                {!isCollapsed && <span>تسجيل الخروج</span>}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-300 ease-out", isCollapsed ? "lg:pr-[78px]" : "lg:pr-[268px]")}>
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-xl transition-colors lg:hidden dark:border-slate-800 dark:bg-slate-950/92">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-gradient-to-br from-white to-cyan-50 p-1.5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-cyan-950/40">
                <Image src="/masar-icon.png" alt="مسار" width={22} height={22} className="h-5 w-5 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="text-[13px] font-black text-slate-900 dark:text-slate-50">مسار</span><span className="h-1 w-1 rounded-full bg-teal-400" /></div>
                <p className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">{currentPageLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle compact />
              <form action={logoutAction}>
                <button type="submit" onClick={clearAnalyticsBeforeLogout} title="تسجيل الخروج" aria-label="تسجيل الخروج" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition active:bg-rose-50 active:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:active:bg-rose-950/40 dark:active:text-rose-300">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto min-h-screen max-w-[1600px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8">
          <UserPresenceHeartbeat />
          <GlobalSubscriptionBanner />
          <TutorialOnboarding initialShowBanner={tutorialInitialShowBanner} />
          {children}
        </main>
      </div>

      <ContextualHelp />
      <MobileBottomNav {...navPermissions} />
    </div>
  );
}
