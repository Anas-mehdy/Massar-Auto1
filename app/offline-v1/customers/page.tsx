import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { OfflineCustomersPilot } from "@/components/offline/offline-customers-pilot";
import { getAuthContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function OfflineCustomersPilotPage() {
  if (process.env.OFFLINE_V1_LAB_ENABLED !== "true") {
    notFound();
  }

  // Require a normal online-authenticated Massar session before rendering the lab.
  // Once rendered, the client keeps a time-limited local authorization snapshot
  // so the pilot can continue working after connectivity is lost.
  await getAuthContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title="مختبر العملاء دون اتصال"
        description="نسخة V1 تجريبية مع IndexedDB وOutbox ومزامنة متعددة الأجهزة. غير مفعلة للمستخدمين افتراضياً."
      />
      <OfflineCustomersPilot />
    </div>
  );
}
