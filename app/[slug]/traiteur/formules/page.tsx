import { notFound } from "next/navigation";
import { getCatalogueProducts } from "@/lib/db/queries";
import { getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import { WizardShell } from "../_components/WizardShell";
import { FormulesForm } from "./FormulesForm";

export default async function FormulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getPublicTenantContext(slug);
  if (!tenant) notFound();
  const { establishment, context } = tenant;

  const products = await runAsTenant(context, (tx) => getCatalogueProducts(tx, establishment.id, "traiteur"));
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <WizardShell establishment={{ name: establishment.name, logoUrl: establishment.logoUrl }} step={2} accentColor={accentColor}>
      <FormulesForm slug={slug} products={products} accentColor={accentColor} />
    </WizardShell>
  );
}
