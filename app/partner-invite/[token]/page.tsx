import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvitationPreview } from "@/lib/services/partnerClientOnboardingService";
import { PartnerClientRegisterForm } from "@/app/partner-register/_partner-client-register-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PartnerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvitationPreview(token);
  if (!invite) notFound();

  return (
    <PartnerClientRegisterForm
      mode="invite"
      keyValue={token}
      partnerName={invite.partnerName}
      presetName={invite.clientName}
      presetEmail={invite.email}
      lockEmail
    />
  );
}
