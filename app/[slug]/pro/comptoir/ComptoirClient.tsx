"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatCHF } from "@/lib/format";
import { checkoutComptoir } from "./actions";
import type { CatalogueProduct } from "@/lib/db/queries";

type RunningItem = { productId: string; name: string; unitPrice: number; quantity: number };

export function ComptoirClient({
  slug,
  establishment,
  products,
}: {
  slug: string;
  establishment: { name: string; accentColor: string | null };
  products: CatalogueProduct[];
}) {
  const [activeCategory, setActiveCategory] = useState("Tout");
  const [items, setItems] = useState<RunningItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accentColor = establishment.accentColor ?? "#1a1a1a";

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.categoryName) set.add(p.categoryName);
    return ["Tout", ...Array.from(set)];
  }, [products]);

  const visibleProducts = activeCategory === "Tout" ? products : products.filter((p) => p.categoryName === activeCategory);
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  function addItem(product: CatalogueProduct) {
    setSuccess(null);
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { productId: product.id, name: product.name, unitPrice: Number(product.priceAmount), quantity: 1 }];
    });
  }

  function removeOne(productId: string) {
    setItems((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  function nouveauClient() {
    setItems([]);
    setClientName("");
    setError(null);
    setSuccess(null);
  }

  function encaisser() {
    setError(null);
    if (items.length === 0) {
      setError("Ajoutez au moins un article.");
      return;
    }
    startTransition(async () => {
      const result = await checkoutComptoir(
        slug,
        items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        clientName
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems([]);
      setClientName("");
      setSuccess(`Encaissé — ${formatCHF(total)}`);
    });
  }

  return (
    <main className="max-w-4xl mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
        <div>
          <p className="font-serif text-base">Commande au comptoir</p>
          <Link href={`/${slug}/pro`} className="text-xs text-stone-400 hover:text-stone-600">
            ← Planning
          </Link>
        </div>
        <button
          onClick={nouveauClient}
          className="text-sm rounded-full border border-stone-200 px-4 py-2 hover:border-stone-300"
        >
          Nouveau client
        </button>
      </div>

      <div className="grid grid-cols-3">
        <div className="col-span-2 border-r border-stone-200">
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

          <div className="grid grid-cols-2 gap-3 p-6">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addItem(product)}
                className="text-left rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-300"
              >
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-xs text-stone-400 mt-0.5">{formatCHF(Number(product.priceAmount))}</p>
              </button>
            ))}
            {visibleProducts.length === 0 && (
              <p className="col-span-2 text-sm text-stone-400 text-center py-8">Aucun produit dans cette catégorie.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="px-5 py-3 border-b border-stone-200">
            <p className="text-xs text-stone-400 mb-2">Commande en cours</p>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nom (optionnel)"
              className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-stone-400"
            />
          </div>

          <div className="flex-1 divide-y divide-stone-100 overflow-y-auto">
            {items.map((item) => (
              <div key={item.productId} className="px-5 py-3 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    {item.name}
                    {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-medium">{formatCHF(item.unitPrice * item.quantity)}</p>
                  <button
                    onClick={() => removeOne(item.productId)}
                    aria-label={`Retirer un ${item.name}`}
                    className="w-5 h-5 rounded-full border border-stone-300 text-stone-400 flex items-center justify-center text-xs"
                  >
                    −
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="px-5 py-8 text-center text-sm text-stone-300">Aucun article</p>}
          </div>

          {error && <p className="mx-5 mb-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="mx-5 mb-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</p>}

          <div className="px-5 py-4 border-t border-stone-200">
            <div className="flex justify-between font-medium mb-3">
              <span>Total</span>
              <span>{formatCHF(total)}</span>
            </div>
            <button
              onClick={encaisser}
              disabled={isPending || items.length === 0}
              className="w-full rounded-lg text-white text-sm font-medium py-3 disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
            >
              {isPending ? "Encaissement…" : "Encaisser"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
