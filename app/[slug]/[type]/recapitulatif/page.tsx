import { notFound } from "next/navigation";
import { getEstablishmentBySlug } from "@/lib/db/queries";
import { RecapitulatifClient } from "./RecapitulatifClient";
import type { OrderType } from "@/lib/types";

function isOrderType(value: string): value is OrderType {
  return value === "boutique" || value === "traiteur";
}

export default async function RecapitulatifPage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = await params;
  if (!isOrderType(type)) notFound();

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  return (
    <RecapitulatifClient
      slug={slug}
      orderType={type}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
    />
  );
}
