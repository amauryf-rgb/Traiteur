import { notFound } from "next/navigation";
import { getClientById } from "@/lib/db/queries";
import { getClientTenantContext, getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import { WizardShell } from "../_components/WizardShell";
import { CoordonneesForm } from "./CoordonneesForm";
import type { WizardContactDraft } from "@/lib/traiteurWizard";

export default async function CoordonneesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getPublicTenantContext(slug);
  if (!tenant) notFound();
  const { establishment, context } = tenant;
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  // Pré-remplissage si le client est connecté (session partagée Boutique/
  // Traiteur, voir getClientTenantContext) — reste entièrement modifiable
  // ensuite, voir CoordonneesForm. La commande en invité reste possible de
  // bout en bout : clientTenant est simplement null dans ce cas.
  const clientTenant = await getClientTenantContext(slug);
  let prefill: Partial<WizardContactDraft> | null = null;
  if (clientTenant) {
    const client = await runAsTenant(context, (tx) => getClientById(tx, establishment.id, clientTenant.session.clientId));
    if (client) {
      prefill = {
        name: client.name,
        email: client.email ?? "",
        phone: client.phone ?? "",
        contactAddressLine1: client.contactAddressLine1 ?? "",
        contactAddressLine2: client.contactAddressLine2 ?? "",
        contactAddressPostalCode: client.contactAddressPostalCode ?? "",
        contactAddressCity: client.contactAddressCity ?? "",
        billingSameAsContact: client.billingSameAsContact,
        billingAddressLine1: client.billingAddressLine1 ?? "",
        billingAddressLine2: client.billingAddressLine2 ?? "",
        billingAddressPostalCode: client.billingAddressPostalCode ?? "",
        billingAddressCity: client.billingAddressCity ?? "",
      };
    }
  }

  return (
    <WizardShell establishment={{ name: establishment.name, logoUrl: establishment.logoUrl }} step={3} accentColor={accentColor}>
      <CoordonneesForm slug={slug} accentColor={accentColor} prefill={prefill} />
    </WizardShell>
  );
}
