import { notFound } from "next/navigation";
import { getCatalogueProducts, getEstablishmentBySlug } from "@/lib/db/queries";
import { getBoutiqueDate, getBoutiqueTimes, getTraiteurDates, getTraiteurTimes } from "@/lib/slots";
import { CatalogueClient } from "./CatalogueClient";
import type { OrderType } from "@/lib/types";

function isOrderType(value: string): value is OrderType {
  return value === "boutique" || value === "traiteur";
}

export default async function CataloguePage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = await params;
  if (!isOrderType(type)) notFound();

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const products = await getCatalogueProducts(establishment.id, type);
  const dates = type === "boutique" ? [getBoutiqueDate()] : getTraiteurDates();
  const times = type === "boutique" ? getBoutiqueTimes() : getTraiteurTimes();

  return (
    <CatalogueClient
      slug={slug}
      orderType={type}
      establishment={{
        name: establishment.name,
        tagline: establishment.tagline,
        accentColor: establishment.accentColor,
      }}
      products={products}
      dates={dates}
      times={times}
    />
  );
}
