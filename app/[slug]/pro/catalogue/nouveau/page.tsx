import { notFound, redirect } from "next/navigation";
import { getAllergensForEstablishment, getEstablishmentBySlug } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { PageHeader, ScreenCard } from "@/components/headers";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role === "employee") redirect(`/${slug}/pro`);
  const { context } = staffTenant;

  const allergenOptions = await runAsTenant(context, (tx) => getAllergensForEstablishment(tx, establishment.id));

  return (
    <ScreenCard>
      <PageHeader title="Ajouter un produit" subtitle={establishment.name} />
      <ProductForm
        slug={slug}
        product={null}
        allergenOptions={allergenOptions.map((a) => ({ id: a.id, label: a.label }))}
        accentColor={establishment.accentColor ?? "#1a1a1a"}
      />
    </ScreenCard>
  );
}
