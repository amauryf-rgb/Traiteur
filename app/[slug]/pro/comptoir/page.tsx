import { notFound, redirect } from "next/navigation";
import { getCatalogueProducts, getEstablishmentBySlug } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { ComptoirClient } from "./ComptoirClient";

export default async function ComptoirPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  const { context } = staffTenant;

  const products = await runAsTenant(context, (tx) => getCatalogueProducts(tx, establishment.id, "boutique"));

  return (
    <ComptoirClient
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      products={products}
    />
  );
}
