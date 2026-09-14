import Link from "next/link";
import { notFound } from "next/navigation";
import { getEstablishmentBySlug, getOrderWithItems } from "@/lib/db/queries";
import { PageHeader, ScreenCard } from "@/components/headers";
import { formatCHF } from "@/lib/format";
import { formatDateLabel } from "@/lib/slots";
import { ClearCheckout } from "./ClearCheckout";
import type { OrderType } from "@/lib/types";

function isOrderType(value: string): value is OrderType {
  return value === "boutique" || value === "traiteur";
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  deposit_paid: "Acompte réglé — solde à régler au retrait",
  paid: "Payé intégralement",
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; type: string; orderId: string }>;
}) {
  const { slug, type, orderId } = await params;
  if (!isOrderType(type)) notFound();

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const result = await getOrderWithItems(orderId);
  if (!result || result.order.establishmentId !== establishment.id || result.order.orderType !== type) {
    notFound();
  }

  const { order, items } = result;
  const pickupLabel = `${formatDateLabel(order.pickupDate)}, ${order.pickupTime.slice(0, 5).replace(":", "h")}`;

  return (
    <ScreenCard>
      <ClearCheckout slug={slug} orderType={type} />
      <PageHeader title="Commande confirmée" subtitle={`${establishment.name} · Retrait ${pickupLabel}`} />

      <div className="divide-y divide-stone-200 px-6">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between py-3 text-sm">
            <span>
              {item.productNameSnapshot}
              {item.quantity > 1 ? ` ×${item.quantity}` : ""}
            </span>
            <span className="font-medium">{formatCHF(Number(item.unitPriceSnapshot) * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-stone-200 flex flex-col gap-1">
        <div className="flex justify-between font-medium">
          <span>Total commande</span>
          <span>{formatCHF(Number(order.totalAmount))}</span>
        </div>
        <p className="text-xs text-stone-400">{PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}</p>
      </div>

      <div className="px-6 pb-6 pt-2">
        <Link
          href={`/${slug}`}
          className="block w-full text-center rounded-lg border border-stone-200 text-sm font-medium py-3 hover:border-stone-300"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </ScreenCard>
  );
}
