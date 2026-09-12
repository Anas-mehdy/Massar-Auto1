import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPartnerPreview } from "@/lib/services/partnerClientOnboardingService";
import { PartnerClientRegisterForm } from "@/app/partner-register/_partner-client-register-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PartnerPublicRegisterPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const partner = await getPublicPartnerPreview(code);
  if (!partner) notFound();

  return (
    <PartnerClientRegisterForm
      mode="public"
      keyValue={partner.partnerCode}
      partnerName={partner.partnerName}
    />
  );
}
