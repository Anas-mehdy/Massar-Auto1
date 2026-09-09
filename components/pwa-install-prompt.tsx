"use client";

import Image from "next/image";
import { Download, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clearOfflineSession, refreshOfflineSessionSnapshot } from "@/lib/offline/offlineSession";
import { syncCustomersNow } from "@/lib/offline/syncEngine";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
]);

function isOfflineSessionPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/partners") ||
    pathname.startsWith("/partner-invite/") ||
    pathname.startsWith("/register/partner/") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/installment-track") ||
    pathname.includes("/print") ||
    pathname.includes("/sticker")
  );
}

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const syncInFlight = useRef(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const navigatorWithStandalone = navigator as NavigatorWithStandalone;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;

    setIsInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setIsInstalled(false);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowIosHelp(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (pathname === "/login") {
      // Reaching the login screen is an explicit trust boundary. Keep cached business
      // data/outbox for durability, but revoke access to it until the next online login.
      void clearOfflineSession();
      return;
    }

    if (isOfflineSessionPublicPath(pathname)) return;

    const refreshAndSync = async () => {
      if (!navigator.onLine || syncInFlight.current) return;
      syncInFlight.current = true;
      try {
        const snapshot = await refreshOfflineSessionSnapshot();
        await syncCustomersNow(snapshot.shop.id);
      } catch {
        // The normal online UI remains authoritative. A transient sync/auth failure must
        // never block rendering; pending outbox entries remain durable for the next retry.
      } finally {
        syncInFlight.current = false;
      }
    };

    void refreshAndSync();
    const handleOnline = () => void refreshAndSync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [pathname]);

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
      setInstallPrompt(null);
      return;
    }

    if (isIos) setShowIosHelp(true);
  }

  if (pathname === "/onboarding" || isInstalled || dismissed || (!installPrompt && !isIos)) return null;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 sm:bottom-5">
        <div className="flex items-center gap-3 rounded-2xl border border-teal-700/20 bg-teal-700 px-3 py-3 text-white shadow-2xl shadow-slate-950/25 sm:gap-4 sm:px-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
            <Image src="/masar-icon.png" alt="مسار" width={34} height={34} className="h-8 w-8 rounded-lg object-contain" />
          </div>

          <div className="min-w-0 flex-1 text-right">
            <p className="text-sm font-black leading-5">ثبّت تطبيق مسار</p>
            <p className="mt-0.5 text-[11px] font-medium leading-5 text-teal-50/90 sm:text-xs">
              وصول أسرع من سطح المكتب أو الشاشة الرئيسية — بدون الحاجة لفتح المتصفح كل مرة.
            </p>
          </div>

          <button
            type="button"
            onClick={install}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-black text-teal-800 shadow-sm transition hover:bg-teal-50 active:scale-[0.98]"
            aria-label="تثبيت تطبيق مسار"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            تثبيت
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="إخفاء اقتراح التثبيت"
            title="إخفاء"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showIosHelp ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="pwa-ios-title" className="text-base font-black text-slate-900">تثبيت مسار على الآيفون</h2>
                <p className="mt-1 text-xs font-medium leading-6 text-slate-500">يتم التثبيت من قائمة المشاركة في Safari.</p>
              </div>
              <button type="button" onClick={() => setShowIosHelp(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm font-bold text-slate-700">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm"><Share2 className="h-4 w-4" /></span>
                <span>1. اضغط زر المشاركة في Safari.</span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">2. اختر «إضافة إلى الشاشة الرئيسية».</div>
              <div className="rounded-2xl bg-slate-50 p-3">3. اضغط «إضافة» وسيظهر مسار كتطبيق مستقل.</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
