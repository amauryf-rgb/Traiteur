import { notFound } from "next/navigation";
import { getCatalogueProducts, getClosuresInRange } from "@/lib/db/queries";
import { getClientTenantContext, getPublicTenantContext, runAsTenant } from "@/lib/tenant";
import {
  closureDatesForType,
  getBoutiqueDate,
  getBoutiqueTimes,
  getClosedDatesInRange,
  getTodayISO,
  getTraiteurDates,
  getTraiteurTimes,
  getTraiteurWindowBounds,
} from "@/lib/slots";
import { CatalogueClient } from "./CatalogueClient";
import { ClosedNotice } from "./ClosedNotice";
import type { OrderType } from "@/lib/types";

function isOrderType(value: string): value is OrderType {
  return value === "boutique" || value === "traiteur";
}

export default async function CataloguePage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = await params;
  if (!isOrderType(type)) notFound();

  const tenant = await getPublicTenantContext(slug);
  if (!tenant) notFound();
  const { establishment, context } = tenant;

  const today = getTodayISO();
  const { end: windowEnd } = getTraiteurWindowBounds();

  const { products, closureRows } = await runAsTenant(context, async (tx) => {
    const products = await getCatalogueProducts(tx, establishment.id, type);
    // Plage couvrant à la fois le cas boutique (aujourd'hui seul) et la
    // fenêtre traiteur complète, en une seule requête.
    const closureRows = await getClosuresInRange(tx, establishment.id, today, windowEnd);
    return { products, closureRows };
  });

  const closedWeekdays = type === "boutique" ? establishment.closedWeekdaysBoutique : establishment.closedWeekdaysTraiteur;
  const closedDates = getClosedDatesInRange(closedWeekdays, closureDatesForType(closureRows, type), today, windowEnd);

  // Boutique n'a qu'un seul jour actionnable (aujourd'hui) : s'il est fermé,
  // remplacer le catalogue par un message plutôt que par une liste vide ou
  // trompeuse (voir isTraiteurDateSelectable pour le même traitement côté
  // traiteur, où "fermé" = "complet", pas un nouvel état).
  if (type === "boutique" && closedDates.has(today)) {
    const todayClosure = closureRows.find((c) => c.date === today && (c.orderType === null || c.orderType === type));
    return (
      <ClosedNotice
        slug={slug}
        establishment={{
          name: establishment.name,
          tagline: establishment.tagline,
          accentColor: establishment.accentColor,
          logoUrl: establishment.logoUrl,
        }}
        reason={todayClosure?.reason ?? null}
      />
    );
  }

  const dates = type === "boutique" ? [getBoutiqueDate()] : getTraiteurDates(closedDates);
  const times = type === "boutique" ? getBoutiqueTimes() : getTraiteurTimes();

  // Affichage seul (nom / lien de déconnexion dans le bandeau) — la
  // vérification d'accès reste inchangée, ce compte n'a jamais été requis
  // pour commander (voir CatalogueHeader).
  const clientTenant = await getClientTenantContext(slug);

  return (
    <CatalogueClient
      slug={slug}
      orderType={type}
      establishment={{
        name: establishment.name,
        tagline: establishment.tagline,
        accentColor: establishment.accentColor,
        logoUrl: establishment.logoUrl,
      }}
      clientName={clientTenant?.session.name ?? null}
      products={products}
      dates={dates}
      times={times}
      closedWeekdays={closedWeekdays}
    />
  );
}
