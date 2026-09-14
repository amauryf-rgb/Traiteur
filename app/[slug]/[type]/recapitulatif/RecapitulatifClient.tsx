"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, ScreenCard } from "@/components/headers";
import { useCheckoutState } from "@/lib/cart";
import { useHydrated } from "@/lib/localStore";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { createOrder } from "../actions";
import type { OrderType } from "@/lib/types";

const DEPOSIT_RATE = 0.3;

export function RecapitulatifClient({
  slug,
  orderType,
  establishment,
}: {
  slug: string;
  orderType: OrderType;
  establishment: { name: string; accentColor: string | null };
}) {
  const router = useRouter();
  const checkout = useCheckoutState(slug, orderType);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [paymentMode, setPaymentMode] = useState<"deposit" | "full">("deposit");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // useCheckoutState rend d'abord la valeur "serveur" (toujours null, le
  // localStorage n'existe pas côté serveur) avant de se resynchroniser sur la
  // vraie valeur client. useHydrated évite de rediriger sur cette valeur
  // transitoire avant que la resynchronisation n'ait eu lieu.
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated && (!checkout || checkout.items.length === 0)) {
      router.replace(`/${slug}/${orderType}`);
    }
  }, [hydrated, checkout, slug, orderType, router]);

  if (!checkout || checkout.items.length === 0) {
    return (
      <ScreenCard>
        <p className="px-6 py-10 text-center text-stone-400 text-sm">Chargement…</p>
      </ScreenCard>
    );
  }

  const activeCheckout = checkout;
  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const total = activeCheckout.items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const depositAmount = Math.round(total * DEPOSIT_RATE * 100) / 100;
  const amountDue = orderType === "traiteur" && paymentMode === "deposit" ? depositAmount : total;
  const pickupLabel = `${formatDateLabel(activeCheckout.date)}, ${activeCheckout.time.replace(":", "h")}`;

  function handleSubmit() {
    setError(null);
    if (!clientName.trim()) {
      setError("Merci d'indiquer votre nom.");
      return;
    }
    startTransition(async () => {
      const result = await createOrder({
        slug,
        orderType,
        date: activeCheckout.date,
        time: activeCheckout.time,
        items: activeCheckout.items,
        reservationIds: activeCheckout.reservationIds,
        clientName,
        clientContact,
        paymentMode: orderType === "boutique" ? "full" : paymentMode,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <ScreenCard>
      <PageHeader title="Récapitulatif de commande" subtitle={`${establishment.name} · Retrait ${pickupLabel}`} />

      <div className="divide-y divide-stone-200 px-6">
        {checkout.items.map((line) => (
          <div key={line.productId} className="flex justify-between py-3 text-sm">
            <span>
              {line.name}
              {line.quantity > 1 ? ` ×${line.quantity}` : ""}
            </span>
            <span className="font-medium">{formatCHF(line.unitPrice * line.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between px-6 py-4 border-y border-stone-200 font-medium">
        <span>Total commande</span>
        <span>{formatCHF(total)}</span>
      </div>

      {orderType === "traiteur" && (
        <div className="px-6 py-4">
          <p className="text-xs text-stone-400 mb-2">Mode de paiement</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPaymentMode("deposit")}
              className="text-left rounded-lg border px-4 py-3 flex justify-between items-start gap-3"
              style={{ borderColor: paymentMode === "deposit" ? accentColor : "#e7e5e4" }}
            >
              <span>
                <span className="block text-sm">Acompte de 30% maintenant</span>
                <span className="block text-xs text-stone-400 mt-0.5">
                  Solde de {formatCHF(total - depositAmount)} réglé au retrait
                </span>
              </span>
              <span className="text-sm font-medium whitespace-nowrap">{formatCHF(depositAmount)}</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode("full")}
              className="text-left rounded-lg border px-4 py-3 flex justify-between items-center gap-3"
              style={{ borderColor: paymentMode === "full" ? accentColor : "#e7e5e4" }}
            >
              <span className="text-sm">Paiement intégral maintenant</span>
              <span className="text-sm font-medium whitespace-nowrap">{formatCHF(total)}</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-6 py-4 border-t border-stone-200 flex flex-col gap-3">
        <p className="text-xs text-stone-400">Vos coordonnées</p>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Nom"
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <input
          value={clientContact}
          onChange={(e) => setClientContact(e.target.value)}
          placeholder="Téléphone ou email"
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
      </div>

      <div className="px-6 py-4 border-t border-stone-200 flex flex-col gap-3">
        <p className="text-xs text-stone-400">Détails de paiement</p>
        <input
          disabled
          placeholder="Numéro de carte"
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-400"
        />
        <div className="flex gap-3">
          <input disabled placeholder="MM / AA" className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-400 flex-1" />
          <input disabled placeholder="CVC" className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-400 flex-1" />
        </div>
      </div>

      {error && <p className="mx-6 mb-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="px-6 pb-6">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full rounded-lg text-white text-sm font-medium py-3 disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {isPending ? "Traitement…" : `Payer ${orderType === "traiteur" && paymentMode === "deposit" ? "l'acompte" : ""} · ${formatCHF(amountDue)}`}
        </button>
        <p className="text-center text-xs text-stone-400 mt-3">
          Simulation — aucun paiement réel n&apos;est traité à ce stade.
        </p>
      </div>
    </ScreenCard>
  );
}
