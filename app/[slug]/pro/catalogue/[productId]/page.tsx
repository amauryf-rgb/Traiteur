import { notFound, redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAllergensForEstablishment, getEstablishmentBySlug, getManagedProductById } from "@/lib/db/queries";
import { PageHeader, ScreenCard } from "@/components/headers";
import { ProductForm } from "../ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const session = await getStaffSession();
  if (!session || session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (session.role === "employee") redirect(`/${slug}/pro`);

  const product = await getManagedProductById(establishment.id, productId);
  if (!product) notFound();

  const allergenOptions = await getAllergensForEstablishment(establishment.id);

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
