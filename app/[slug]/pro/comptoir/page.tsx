import { notFound, redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getCatalogueProducts, getEstablishmentBySlug } from "@/lib/db/queries";
import { ComptoirClient } from "./ComptoirClient";

export default async function ComptoirPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const session = await getStaffSession();
  if (!session || session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);

  const products = await getCatalogueProducts(establishment.id, "boutique");

  return (
    <ComptoirClient
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      products={products}
    />
  );
}
