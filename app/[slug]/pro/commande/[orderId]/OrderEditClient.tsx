"use client";

import { useMemo, useState, useTransition } from "react";
import { PageHeader, ScreenCard } from "@/components/headers";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { Button } from "@/components/ui/Button";
import { updateOrderQuantities } from "./actions";
import type { orderItems, orders } from "@/lib/db/schema";

type Order = typeof orders.$inferSelect;
type OrderItem = typeof orderItems.$inferSelect;

export function OrderEditClient({
  slug,
  establishment,
  order,
  items,
}: {
  slug: string;
  establishment: { name: string; accentColor: string | null };
  order: Order;
  items: OrderItem[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map((item) => [item.id, item.quantity]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const pickupLabel = `${formatDateLabel(order.pickupDate)}, ${order.pickupTime.slice(0, 5).replace(":", "h")}`;

  const newTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.unitPriceSnapshot) * (quantities[item.id] ?? item.quantity), 0),
    [items, quantities]
  );
  const paidAmount = Number(order.paidAmount);
  const refundAmount = Math.max(0, Math.round((paidAmount - newTotal) * 100) / 100);
  const hasChanges = items.some((item) => (quantities[item.id] ?? item.quantity) !== item.quantity);

  function setQuantity(itemId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, quantity) }));
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderQuantities(slug, order.id, quantities);
      if (result.error) setError(result.error);
    });
  }

  return (
    <ScreenCard>
      <PageHeader title={`Commande — ${order.clientName}`} subtitle={`Retrait ${pickupLabel} · ${establishment.name}`} />

      <div className="divide-y divide-stone-200 px-6">
        {items.map((item) => {
          const quantity = quantities[item.id] ?? item.quantity;
          return (
            <div key={item.id} className="py-4 flex justify-between items-center gap-3">
              <div>
                <p className="text-sm font-medium">{item.productNameSnapshot}</p>
                <p className="text-xs text-stone-400">
                  {formatCHF(Number(item.unitPriceSnapshot))} / pièce
                  {quantity !== item.quantity ? ` — ${item.quantity} → ${quantity}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setQuantity(item.id, quantity - 1)}
                  className="w-7 h-7 rounded-full border border-stone-300 text-stone-500 flex items-center justify-center"
                  aria-label={`Retirer un ${item.productNameSnapshot}`}
                >
                  −
                </button>
                <span className="w-4 text-center text-sm">{quantity}</span>
                <button
                  onClick={() => setQuantity(item.id, quantity + 1)}
                  className="w-7 h-7 rounded-full border flex items-center justify-center"
                  style={{ borderColor: accentColor, color: accentColor }}
                  aria-label={`Ajouter un ${item.productNameSnapshot}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-stone-200 flex flex-col gap-1">
        <div className="flex justify-between text-sm">
          <span className="text-stone-400">Total mis à jour</span>
          <span>{formatCHF(newTotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-stone-400">Déjà réglé par le client</span>
          <span>{formatCHF(paidAmount)}</span>
        </div>
        {refundAmount > 0 && (
          <div className="flex justify-between text-sm font-medium mt-1" style={{ color: "#b45309" }}>
            <span>Remboursement dû</span>
            <span>{formatCHF(refundAmount)}</span>
          </div>
        )}
      </div>

      {error && <p className="mx-6 mb-4 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="px-6 pb-6">
        <Button onClick={handleConfirm} disabled={isPending || !hasChanges} accentColor={accentColor} className="w-full">
          {isPending
            ? "Traitement…"
            : refundAmount > 0
              ? `Confirmer et rembourser ${formatCHF(refundAmount)}`
              : "Confirmer les modifications"}
        </Button>
      </div>
    </ScreenCard>
  );
}
