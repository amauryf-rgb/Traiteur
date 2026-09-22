"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CatalogueHeader } from "./CatalogueHeader";
import { saveCheckoutState, useCart } from "@/lib/cart";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { Button } from "@/components/ui/Button";
import { reserveSlot } from "./actions";
import { TraiteurCalendar } from "./TraiteurCalendar";
import { MenuRow } from "./MenuRow";
import type { CatalogueProduct } from "@/lib/db/queries";
import type { OrderType } from "@/lib/types";

type Establishment = { name: string; tagline: string | null; accentColor: string | null; logoUrl?: string | null };

const EYEBROW: Record<OrderType, string> = {
  boutique: "Boutique du jour",
  traiteur: "Commande traiteur",
};

export function CatalogueClient({
  slug,
  orderType,
  establishment,
  clientName,
  products,
  dates,
  times,
  closedWeekdays,
}: {
  slug: string;
  orderType: OrderType;
  establishment: Establishment;
  clientName: string | null;
  products: CatalogueProduct[];
  dates: string[];
  times: string[];
  closedWeekdays: number[];
}) {
  const router = useRouter();
  const cart = useCart(slug, orderType);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [selectedTime, setSelectedTime] = useState(times[0] ?? "");
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [dateView, setDateView] = useState<"liste" | "calendrier">("liste");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Ordre des onglets = categories.sortOrder (configuré par le pro), pas
  // l'ordre d'apparition des produits en base qui serait arbitraire.
  const categories = useMemo(() => {
    const orderByName = new Map<string, number>();
    for (const p of products) {
      if (p.categoryName && !orderByName.has(p.categoryName)) {
        orderByName.set(p.categoryName, p.categorySortOrder ?? 0);
      }
    }
    const sorted = Array.from(orderByName.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    return ["Tout", ...sorted];
  }, [products]);

  const visibleProducts = activeCategory === "Tout" ? products : products.filter((p) => p.categoryName === activeCategory);
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  // Sous-titre de section (renseigné par le pro, écran catalogue) : regroupe
  // les produits partageant le même intitulé sous un même titre de section,
  // affiché en 2 colonnes sur desktop. Tant qu'aucune section n'est
  // configurée pour la catégorie active, tout tombe dans un seul groupe
  // sans titre — liste simple, comportement identique à avant ce chantier.
  const sections = useMemo(() => {
    const bySection = new Map<string, CatalogueProduct[]>();
    for (const p of visibleProducts) {
      const key = p.sectionTitle ?? "";
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(p);
    }
    return Array.from(bySection.entries());
  }, [visibleProducts]);
  const useColumns = sections.length > 1;

  function quantityFor(productId: string) {
    return cart.items.find((line) => line.productId === productId)?.quantity ?? 0;
  }

  function updateQuantity(product: CatalogueProduct, quantity: number) {
    cart.setQuantity({ id: product.id, name: product.name, price: Number(product.priceAmount) }, Math.max(0, quantity));
  }

  function handleContinue() {
    setError(null);
    if (!selectedTime) {
      setError("Choisissez un créneau de retrait.");
      return;
    }
    startTransition(async () => {
      const result = await reserveSlot({
        slug,
        orderType,
        date: selectedDate,
        time: selectedTime,
        items: cart.items.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      saveCheckoutState(slug, orderType, {
        reservationIds: result.reservationIds,
        expiresAt: result.expiresAt,
        date: selectedDate,
        time: selectedTime,
        items: cart.items,
      });
      router.push(`/${slug}/${orderType}/recapitulatif`);
    });
  }

  if (times.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50">
        <CatalogueHeader
          slug={slug}
          orderType={orderType}
          establishment={establishment}
          clientName={clientName}
          ctaLabel="Voir le panier"
          ctaDisabled
          onCtaClick={() => {}}
        />
        <p className="max-w-4xl mx-auto px-6 py-10 text-center text-stone-400 text-sm">
          Aucun créneau de retrait disponible pour aujourd&apos;hui. Revenez demain.
        </p>
      </div>
    );
  }

  const dateTimeSelector =
    orderType === "traiteur" && dateView === "calendrier" ? (
      <>
        <TraiteurCalendar
          slug={slug}
          productIds={cart.items.map((line) => line.productId)}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          accentColor={accentColor}
          closedWeekdays={closedWeekdays}
        />
        <label className="block px-6 py-3 border-b border-stone-200 text-left">
          <span className="block text-xs text-stone-400">Heure</span>
          <select
            className="text-sm bg-transparent outline-none w-full"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
          >
            {times.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
      </>
    ) : (
      <div className="grid grid-cols-2 divide-x divide-stone-200 border-b border-stone-200">
        <label className="px-4 py-3 text-left">
          <span className="block text-xs text-stone-400">Retrait</span>
          {orderType === "boutique" ? (
            <span className="text-sm">Aujourd&apos;hui</span>
          ) : (
            <select
              className="text-sm bg-transparent outline-none w-full"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {formatDateLabel(date)}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="px-4 py-3 text-left">
          <span className="block text-xs text-stone-400">Heure</span>
          <select
            className="text-sm bg-transparent outline-none w-full"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
          >
            {times.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
      </div>
    );

  const cartSummary = (
    <>
      <p className="text-xs text-stone-400">
        {cart.totalItems} article{cart.totalItems > 1 ? "s" : ""}
      </p>
      <p className="text-sm font-medium">{formatCHF(cart.totalAmount)}</p>
    </>
  );

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      <CatalogueHeader
        slug={slug}
        orderType={orderType}
        establishment={establishment}
        clientName={clientName}
        ctaLabel={isPending ? "Réservation…" : "Voir le panier"}
        ctaDisabled={cart.totalItems === 0 || isPending}
        onCtaClick={handleContinue}
      />

      <div className="text-center px-6 pt-12 pb-8">
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: accentColor }}>
          {EYEBROW[orderType]}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl">{establishment.name}</h1>
      </div>

      <div className="max-w-4xl mx-auto px-6">
        {orderType === "traiteur" && (
          <div className="flex justify-end gap-3 pt-3 text-xs pb-2">
            <button
              onClick={() => setDateView("liste")}
              style={dateView === "liste" ? { color: accentColor, fontWeight: 500 } : { color: "#a8a29e" }}
            >
              Liste
            </button>
            <button
              onClick={() => setDateView("calendrier")}
              style={dateView === "calendrier" ? { color: accentColor, fontWeight: 500 } : { color: "#a8a29e" }}
            >
              Calendrier
            </button>
          </div>
        )}

        <div className="border-t border-stone-200">{dateTimeSelector}</div>

        <div className="flex flex-wrap justify-center gap-6 py-4 border-b border-stone-200">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className="pb-1.5 whitespace-nowrap relative text-xs uppercase tracking-wider"
              style={
                activeCategory === category
                  ? { borderBottom: `2px solid ${accentColor}`, color: accentColor, fontWeight: 500 }
                  : { color: "#a8a29e" }
              }
            >
              {category}
            </button>
          ))}
        </div>

        <div className={`py-6 ${useColumns ? "lg:columns-2 lg:gap-x-14" : ""}`}>
          {sections.map(([title, items]) => (
            <div key={title || "_none"} className="break-inside-avoid mb-8 last:mb-0">
              {title && (
                <p className="font-serif italic text-lg mb-3" style={{ color: accentColor }}>
                  {title}
                </p>
              )}
              <div>
                {items.map((product) => (
                  <MenuRow
                    key={product.id}
                    product={product}
                    quantity={quantityFor(product.id)}
                    accentColor={accentColor}
                    isOpen={openProductId === product.id}
                    onToggleOpen={() => setOpenProductId((prev) => (prev === product.id ? null : product.id))}
                    onUpdateQuantity={(quantity) => updateQuantity(product, quantity)}
                  />
                ))}
              </div>
            </div>
          ))}
          {visibleProducts.length === 0 && (
            <p className="py-8 text-center text-stone-400 text-sm">Aucun produit dans cette catégorie.</p>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200">
        {error && <p className="max-w-4xl mx-auto bg-red-50 text-red-700 text-xs px-6 py-2 text-center">{error}</p>}
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>{cartSummary}</div>
          <Button onClick={handleContinue} disabled={cart.totalItems === 0 || isPending} accentColor={accentColor}>
            {isPending ? "Réservation…" : "Voir le panier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
