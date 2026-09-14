import { notFound, redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAllergensForEstablishment, getEstablishmentBySlug } from "@/lib/db/queries";
import { PageHeader, ScreenCard } from "@/components/headers";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const session = await getStaffSession();
  if (!session || session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (session.role === "employee") redirect(`/${slug}/pro`);

  const allergenOptions = await getAllergensForEstablishment(establishment.id);

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
