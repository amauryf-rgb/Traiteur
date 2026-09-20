"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandBanner } from "@/components/headers";
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

export function CatalogueClient({
  slug,
  orderType,
  establishment,
  products,
  dates,
  times,
  closedWeekdays,
}: {
  slug: string;
  orderType: OrderType;
  establishment: Establishment;
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.categoryName) set.add(p.categoryName);
    return ["Tout", ...Array.from(set)];
  }, [products]);

  const visibleProducts = activeCategory === "Tout" ? products : products.filter((p) => p.categoryName === activeCategory);
  const accentColor = establishment.accentColor ?? "#1a1a1a";

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
        <main className="max-w-md lg:max-w-5xl mx-auto lg:my-10 border border-stone-200 lg:rounded-xl overflow-hidden bg-white">
          <BrandBanner establishment={establishment} />
          <p className="px-6 py-10 text-center text-stone-400 text-sm">
            Aucun créneau de retrait disponible pour aujourd&apos;hui. Revenez demain.
          </p>
        </main>
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
    <div className="min-h-screen bg-stone-50 pb-24 lg:pb-10">
      <main className="max-w-md lg:max-w-5xl mx-auto lg:my-10 border border-stone-200 lg:rounded-xl overflow-hidden bg-white">
        <BrandBanner establishment={establishment} />

        {orderType === "traiteur" && (
          <div className="flex justify-end gap-3 px-6 pt-3 text-xs border-b border-stone-200 pb-2 lg:border-b-0">
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

        <div className="lg:grid lg:grid-cols-3">
          <div className="lg:col-span-2 lg:border-r border-stone-200">
            {dateTimeSelector}

            <div className="flex gap-4 px-6 py-3 border-b border-stone-200 text-sm overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className="pb-1 whitespace-nowrap"
                  style={
                    activeCategory === category
                      ? { borderBottom: `2px solid ${accentColor}`, color: accentColor }
                      : { color: "#a8a29e" }
                  }
                >
                  {category}
                </button>
              ))}
            </div>

            <div>
              {visibleProducts.map((product) => (
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
              {visibleProducts.length === 0 && (
                <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucun produit dans cette catégorie.</p>
              )}
            </div>
          </div>

          {/* Panier — barre fixe en bas sur mobile (peu d'espace vertical),
              panneau collant dans la colonne latérale sur desktop (l'espace
              horizontal disponible permet de le garder visible en permanence
              sans manger l'écran comme le ferait une barre fixe pleine largeur). */}
          <div className="hidden lg:block">
            <div className="sticky top-6 m-6 border border-stone-200 rounded-lg p-5">
              <p className="text-xs text-stone-400 mb-3">Votre commande</p>
              {cartSummary}
              {error && <p className="text-red-700 bg-red-50 rounded-lg px-3 py-2 text-xs mt-3">{error}</p>}
              <Button onClick={handleContinue} disabled={cart.totalItems === 0 || isPending} accentColor={accentColor} className="w-full mt-4">
                {isPending ? "Réservation…" : "Voir le panier"}
              </Button>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 lg:hidden">
        {error && <p className="max-w-md mx-auto bg-red-50 text-red-700 text-xs px-6 py-2 text-center">{error}</p>}
        <div className="max-w-md mx-auto bg-white border-t border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>{cartSummary}</div>
          <Button onClick={handleContinue} disabled={cart.totalItems === 0 || isPending} accentColor={accentColor}>
            {isPending ? "Réservation…" : "Voir le panier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
