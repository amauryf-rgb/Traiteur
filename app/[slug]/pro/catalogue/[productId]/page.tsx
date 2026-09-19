import { notFound, redirect } from "next/navigation";
import { getAllergensForEstablishment, getEstablishmentBySlug, getManagedProductById } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { PageHeader, ScreenCard } from "@/components/headers";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role === "employee") redirect(`/${slug}/pro`);
  const { context } = staffTenant;

  const { product, allergenOptions } = await runAsTenant(context, async (tx) => {
    const product = await getManagedProductById(tx, establishment.id, productId);
    const allergenOptions = await getAllergensForEstablishment(tx, establishment.id);
    return { product, allergenOptions };
  });
  if (!product) notFound();

  return (
    <ScreenCard>
      <PageHeader title="Modifier le produit" subtitle={establishment.name} />
      <ProductForm
        slug={slug}
        product={product}
        allergenOptions={allergenOptions.map((a) => ({ id: a.id, label: a.label }))}
        accentColor={establishment.accentColor ?? "#1a1a1a"}
      />
    </ScreenCard>
  );
}
