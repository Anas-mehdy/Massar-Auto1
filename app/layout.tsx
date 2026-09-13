import type { Metadata, Viewport } from "next";
import { Cairo, Outfit } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AnalyticsIdentity, type AnalyticsIdentityData } from "@/components/analytics/analytics-identity";
import { AnalyticsPageTracker } from "@/components/analytics/analytics-page-tracker";
import { DashboardKpiNavigation } from "@/components/dashboard/dashboard-kpi-navigation";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { AutoPrintShortcuts } from "@/components/auto-print-shortcuts";
import { LifetimeOfferBanner } from "@/components/lifetime-offer-banner";
import { QuickOperationsLauncher } from "@/components/quick-operations";
import { ThemeRouteSync } from "@/components/theme-route-sync";
import { getAuthContext, can } from "@/lib/auth/context";
import type { AppPermission } from "@/lib/auth/permissions";
import { APP_URL } from "@/lib/app-url";
import { getPostHogBrowserSnippet } from "@/lib/analytics/posthog-snippet";
import { prisma } from "@/lib/prisma";
import { subscriptionOfferService } from "@/lib/services/subscriptionOfferService";
import { lifetimeSubscriptionService } from "@/lib/services/lifetimeSubscriptionService";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./masar-ui.css";
import "./dark-mode-phase2.css";
import "./dark-mode-phase2-financial.css";
import "./dark-mode-phase2-commerce.css";
import "./dark-mode-phase2-management.css";
import "./dark-mode-phase2-auxiliary.css";
import "./dark-mode-phase2-final-audit.css";
import "./dark-mode-preview-fixes.css";
import "./dark-mode-preview-repair-orders.css";
import "./dark-mode-preview-sales.css";
import "./dark-mode-preview-software-services.css";
import "./dark-mode-preview-inventory.css";
import "./dark-mode-preview-invoices.css";
import "./dark-mode-preview-invoice-details.css";
import "./dark-mode-mobile-polish.css";

const cairo = Cairo({ subsets: ["arabic"], weight: ["300","400","500","600","700","800","900"], variable: "--font-cairo", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], weight: ["300","400","500","600","700","800","900"], variable: "--font-outfit", display: "swap" });
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, themeColor: "#0f766e" };
export const metadata: Metadata = { metadataBase: new URL(APP_URL), title: "مسار | إدارة مراكز صيانة المركبات", description: "مسار متكامل لإدارة مراكز صيانة المركبات من الاستقبال والفحص حتى الفاتورة والتسليم", applicationName: "مسار", manifest: "/manifest.webmanifest", icons: { icon: [{ url: "/massar-pwa-192.png", sizes: "192x192", type: "image/png" }, { url: "/massar-pwa-512.png", sizes: "512x512", type: "image/png" }], apple: [{ url: "/massar-apple-touch.png", sizes: "180x180", type: "image/png" }] }, appleWebApp: { capable: true, statusBarStyle: "default", title: "مسار" } };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let navPermissions: AppPermission[] = [];
  let canManageSubscription = false, canManageDebts = false, showTutorialBanner = false;
  let subscriptionReadOnly = false;
  let lifetimeBanner: { remaining: number; total: number } | null = null;
  let analyticsIdentity: AnalyticsIdentityData | null = null;

  try {
    const auth = await getAuthContext({ allowRedirect: false });
    navPermissions = auth.permissions;
    analyticsIdentity = {
      userId: auth.user.id,
      shopId: auth.shop.id,
      countryCode: auth.shop.countryCode,
      currency: auth.shop.currency,
      membershipRole: auth.membership.role,
    };
    canManageDebts = can(auth, "debts:manage");

    try {
      const entitlement = await entitlementService.getEntitlementContext(auth.shop.id);
      subscriptionReadOnly = !entitlement.isOperationallyActive;
      analyticsIdentity = {
        ...analyticsIdentity,
        subscriptionStatus: entitlement.subscription.effectiveStatus,
        isLifetime: entitlement.subscription.isLifetime,
        trialDaysRemaining: entitlement.subscription.effectiveStatus === "TRIALING"
          ? Math.max(0, Math.ceil((entitlement.subscription.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
          : null,
      };
    } catch (error) {
      console.error("[SubscriptionReadOnly] Failed to resolve operational access", error);
      subscriptionReadOnly = true;
    }

    const tutorialRows = await prisma.$queryRaw<Array<{ tutorialBannerSeenAt: Date | null }>>`
      SELECT "tutorialBannerSeenAt"
      FROM "User"
      WHERE "id" = ${auth.user.id}::uuid AND "deletedAt" IS NULL
      LIMIT 1
    `;
    showTutorialBanner = tutorialRows[0]?.tutorialBannerSeenAt == null;

    const hasSubscriptionPermission = can(auth, "subscription:manage");
    if (hasSubscriptionPermission) {
      const rows = await prisma.$queryRaw<Array<{ partnerId: string | null }>>`
        SELECT "partnerId"
        FROM "Shop"
        WHERE "id" = ${auth.shop.id}::uuid AND "deletedAt" IS NULL
        LIMIT 1
      `;
      canManageSubscription = !rows[0]?.partnerId;

      if (canManageSubscription) {
        try {
          const activeLifetime = await lifetimeSubscriptionService.getActiveLifetimeForShop(auth.shop.id);
          if (!activeLifetime) {
            const offer = await subscriptionOfferService.getOfferSettings();
            if (offer.isActive && offer.remainingEligible > 0) lifetimeBanner = { remaining: offer.remainingEligible, total: offer.totalEligible };
          }
        } catch (error) {
          console.error("[LifetimeBanner] Failed to resolve banner state", error);
          lifetimeBanner = null;
        }
      }
    }
  } catch {
    navPermissions = [];
    canManageSubscription = false;
    canManageDebts = false;
    showTutorialBanner = false;
    subscriptionReadOnly = false;
    lifetimeBanner = null;
    analyticsIdentity = null;
  }

  const postHogSnippet = getPostHogBrowserSnippet();

  return <html lang="ar" dir="rtl" suppressHydrationWarning className={`${cairo.variable} ${outfit.variable} overflow-x-hidden w-full max-w-full`}>
    <head>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      {postHogSnippet ? <script dangerouslySetInnerHTML={{ __html: postHogSnippet }} /> : null}
    </head>
    <body className="font-sans antialiased overflow-x-hidden min-h-screen w-full max-w-full">
      <AnalyticsIdentity identity={analyticsIdentity} />
      <AnalyticsPageTracker authenticated={Boolean(analyticsIdentity)} />
      <ThemeRouteSync />
      <DashboardKpiNavigation />
      <PwaInstallPrompt />
      {lifetimeBanner ? <LifetimeOfferBanner remaining={lifetimeBanner.remaining} total={lifetimeBanner.total} /> : null}
      <AppShell permissions={navPermissions} canManageSubscription={canManageSubscription} subscriptionReadOnly={subscriptionReadOnly} tutorialInitialShowBanner={showTutorialBanner}>{children}</AppShell>
      <AutoPrintShortcuts />
      <QuickOperationsLauncher canManageDebts={canManageDebts} readOnly={subscriptionReadOnly} />
    </body>
  </html>;
}
