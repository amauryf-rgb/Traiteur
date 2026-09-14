"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandBanner } from "@/components/headers";
import { saveCheckoutState, useCart } from "@/lib/cart";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { reserveSlot } from "./actions";
import type { CatalogueProduct } from "@/lib/db/queries";
import type { OrderType } from "@/lib/types";

type Establishment = { name: string; tagline: string | null; accentColor: string | null };

export function CatalogueClient({
  slug,
  orderType,
  establishment,
  products,
  dates,
  times,
}: {
  slug: string;
  orderType: OrderType;
  establishment: Establishment;
  products: CatalogueProduct[];
  dates: string[];
  times: string[];
}) {
  const router = useRouter();
  const cart = useCart(slug, orderType);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [selectedTime, setSelectedTime] = useState(times[0] ?? "");
  const [activeCategory, setActiveCategory] = useState("Tout");
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
      <main className="max-w-md mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
        <BrandBanner establishment={establishment} />
        <p className="px-6 py-10 text-center text-stone-400 text-sm">
          Aucun créneau de retrait disponible pour aujourd&apos;hui. Revenez demain.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white pb-20">
      <BrandBanner establishment={establishment} />

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

      <div className="divide-y divide-stone-200">
        {visibleProducts.map((product) => {
          const qty = quantityFor(product.id);
          return (
            <div key={product.id}>
              {product.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.photoUrl} alt={product.name} className="w-full h-32 object-cover" />
              ) : (
                <div className="w-full h-8 bg-stone-50 flex items-center justify-center text-[11px] text-stone-300 uppercase tracking-wide">
                  Photo produit
                </div>
              )}
              <div className="px-6 py-4">
                <div className="flex justify-between items-baseline gap-3">
                  <p className="font-serif text-base">{product.name}</p>
                  <p className="text-sm font-medium whitespace-nowrap">{formatCHF(Number(product.priceAmount))}</p>
                </div>
                {product.description && <p className="text-sm text-stone-500 mt-1">{product.description}</p>}
                {product.allergens.length > 0 && (
                  <p className="text-xs text-stone-400 mt-1">Contient {product.allergens.join(", ").toLowerCase()}</p>
                )}
                <div className="flex justify-end items-center gap-3 mt-2">
                  <button
                    onClick={() => updateQuantity(product, qty - 1)}
                    className="w-7 h-7 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center"
                    aria-label={`Retirer un ${product.name}`}
                  >
                    −
                  </button>
                  <span className="w-4 text-center text-sm">{qty}</span>
                  <button
                    onClick={() => updateQuantity(product, qty + 1)}
                    className="w-7 h-7 rounded-full border flex items-center justify-center"
                    style={{ borderColor: accentColor, color: accentColor }}
                    aria-label={`Ajouter un ${product.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {visibleProducts.length === 0 && (
          <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucun produit dans cette catégorie.</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0">
        {error && <p className="max-w-md mx-auto bg-red-50 text-red-700 text-xs px-6 py-2 text-center">{error}</p>}
        <div className="max-w-md mx-auto bg-white border-t border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-stone-400">
              {cart.totalItems} article{cart.totalItems > 1 ? "s" : ""}
            </p>
            <p className="text-sm font-medium">{formatCHF(cart.totalAmount)}</p>
          </div>
          <button
            onClick={handleContinue}
            disabled={cart.totalItems === 0 || isPending}
            className="px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: accentColor }}
          >
            {isPending ? "Réservation…" : "Voir le panier"}
          </button>
        </div>
      </div>
    </main>
  );
}
