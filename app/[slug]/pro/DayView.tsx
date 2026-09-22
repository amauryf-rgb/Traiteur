import Link from "next/link";
import { addDaysISO, formatDateLabel } from "@/lib/slots";
import { formatCHF } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { assignLot, assignOrderToStaff, deleteLot, togglePrepared, unassignOrder } from "./actions";
import type { OrderWithItems, ProductionLotWithAssignee } from "@/lib/db/queries";
import type { ProductAggregate } from "@/lib/aggregate";

const PAYMENT_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Non payé", tone: "warning" },
  deposit_paid: { label: "Acompte versé", tone: "info" },
  paid: { label: "Payé", tone: "success" },
  refunded_partial: { label: "Remb. partiel", tone: "neutral" },
  refunded_full: { label: "Remboursé", tone: "neutral" },
};

// Statut de production par ligne de produit — "À faire" tant que la
// quantité n'est pas entièrement couverte par des lots, "Assigné" une fois
// couverte mais pas encore terminée, "Prêt" quand tous les lots couvrant
// cette ligne sont marqués faits.
function productionStatus(remaining: number, lots: ProductionLotWithAssignee[]): { label: string; tone: BadgeTone } {
  if (remaining > 0) return { label: "À faire", tone: "warning" };
  if (lots.length > 0 && lots.every((lot) => lot.status === "done")) return { label: "Prêt", tone: "success" };
  return { label: "Assigné", tone: "info" };
}

export function DayView({
  slug,
  date,
  isToday,
  activeOrders,
  aggregated,
  dailyMaxByProduct,
  lotsByProduct,
  staff,
  accentColor,
}: {
  slug: string;
  date: string;
  isToday: boolean;
  activeOrders: OrderWithItems[];
  aggregated: ProductAggregate[];
  dailyMaxByProduct: Map<string, number>;
  lotsByProduct: Map<string, ProductionLotWithAssignee[]>;
  staff: { id: string; name: string }[];
  accentColor: string;
}) {
  const staffNameById = new Map(staff.map((member) => [member.id, member.name]));
  const chiffreDuJour = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const nowMinutes = (() => {
    const [h, m] = new Date().toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour12: false }).split(":").map(Number);
    return h * 60 + m;
  })();
  const prochainRetrait = isToday
    ? activeOrders
        .filter((o) => o.status !== "completed")
        .map((o) => o.pickupTime.slice(0, 5))
        .filter((t) => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m >= nowMinutes;
        })
        .sort()[0]
    : undefined;

  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200">
        <Link href={`/${slug}/pro?date=${addDaysISO(date, -1)}`} className="text-stone-400 hover:text-stone-600 px-2">
          ←
        </Link>
        <p className="text-sm font-medium">{isToday ? "Aujourd'hui" : formatDateLabel(date)}</p>
        <Link href={`/${slug}/pro?date=${addDaysISO(date, 1)}`} className="text-stone-400 hover:text-stone-600 px-2">
          →
        </Link>
      </div>

      {/* Chiffres pro : sans-serif et gras plutôt que serif — priorité à la
          lecture rapide, pas à l'évocation (contrairement au nom du plat/de
          l'établissement, qui reste en serif). */}
      <div className="grid grid-cols-3 divide-x divide-stone-200 border-b border-stone-200 text-center">
        <div className="px-3 py-4">
          <p className="text-xl font-semibold">{activeOrders.length}</p>
          <p className="text-xs text-stone-400 mt-1">Commande{activeOrders.length > 1 ? "s" : ""}</p>
        </div>
        <div className="px-3 py-4">
          <p className="text-xl font-semibold">{formatCHF(chiffreDuJour)}</p>
          <p className="text-xs text-stone-400 mt-1">Chiffre du jour</p>
        </div>
        <div className="px-3 py-4">
          <p className="text-xl font-semibold">{prochainRetrait ? prochainRetrait.replace(":", "h") : "—"}</p>
          <p className="text-xs text-stone-400 mt-1">Prochain retrait</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-stone-200">
      <div className="px-6 py-4 border-b border-stone-200 lg:border-b-0">
        <p className="text-xs text-stone-400 mb-3">À produire {isToday ? "aujourd'hui" : "ce jour"}</p>
        {aggregated.length === 0 && <p className="text-sm text-stone-400">Aucune commande ce jour.</p>}
        <div className="flex flex-col gap-3">
          {aggregated.map((item) => {
            const max = dailyMaxByProduct.get(item.productId);
            const pct = max ? Math.min(100, Math.round((item.quantity / max) * 100)) : null;
            const nearLimit = pct !== null && pct >= 80;
            const productLots = lotsByProduct.get(item.productId) ?? [];
            const assignedQty = productLots.reduce((sum, l) => sum + l.quantity, 0);
            const remaining = item.quantity - assignedQty;

            const status = productionStatus(remaining, productLots);

            return (
              <div key={item.productId}>
                <div className="flex justify-between items-center gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{item.name}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <span className={`shrink-0 ${nearLimit ? "font-medium text-amber-700" : "font-medium"}`}>
                    {item.quantity}
                    {max ? ` / ${max}` : ""}
                  </span>
                </div>
                {pct !== null && (
                  <div className="h-1.5 rounded-full bg-stone-100 mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: nearLimit ? "#b45309" : accentColor }}
                    />
                  </div>
                )}

                {productLots.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {productLots.map((lot) => (
                      <div key={lot.id} className="flex items-center justify-between text-xs text-stone-500 bg-stone-50 rounded-md px-2 py-1">
                        <span>
                          {lot.quantity} → {lot.assigneeName ?? "Non assigné"} · prêt {lot.readyByTime.slice(0, 5).replace(":", "h")}
                        </span>
                        <form action={deleteLot.bind(null, slug, lot.id)}>
                          <button type="submit" className="text-red-500 hover:text-red-700">
                            Retirer
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}

                {remaining > 0 && (
                  <form action={assignLot.bind(null, slug)} className="mt-2 flex items-center gap-2 flex-wrap">
                    <input type="hidden" name="productId" value={item.productId} />
                    <input type="hidden" name="date" value={date} />
                    <input
                      type="number"
                      name="quantity"
                      defaultValue={remaining}
                      min={1}
                      max={remaining}
                      className="w-16 border border-stone-200 rounded-md px-2 py-1 text-xs"
                    />
                    <select name="assignedTo" className="border border-stone-200 rounded-md px-2 py-1 text-xs">
                      <option value="">— Assigner à —</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                    <input type="time" name="readyByTime" defaultValue="10:00" className="border border-stone-200 rounded-md px-2 py-1 text-xs" />
                    <button
                      type="submit"
                      className="text-xs rounded-md px-2 py-1 text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      Assigner
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-stone-200">
        <p className="px-6 pt-4 text-xs text-stone-400">Commandes</p>
        {activeOrders.map((order) => (
          <div key={order.id} className="px-6 py-4 flex items-start gap-4">
            <form action={togglePrepared.bind(null, slug, order.id, order.status)}>
              <button
                type="submit"
                aria-label={order.status === "completed" ? "Marquer non préparée" : "Marquer préparée"}
                className="w-6 h-6 rounded-md border flex items-center justify-center text-xs mt-0.5"
                style={
                  order.status === "completed"
                    ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                    : { borderColor: "#d6d3d1", color: "transparent" }
                }
              >
                ✓
              </button>
            </form>
            <div className="flex-1">
              <div className="flex justify-between items-baseline gap-3">
                <p className="text-sm font-medium">
                  {order.pickupTime.slice(0, 5).replace(":", "h")} · {order.clientName}
                </p>
                <p className="text-sm font-medium whitespace-nowrap">{formatCHF(Number(order.totalAmount))}</p>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                {order.items.map((i) => `${i.productNameSnapshot} ×${i.quantity}`).join(", ")}
              </p>

              {/* Mode d'assignation "commande entière" — coexiste avec
                  l'assignation par produit agrégé (colonne de gauche), sans
                  la remplacer. Le pro choisit l'un ou l'autre par commande. */}
              <div className="mt-1.5">
                {order.assignedTo ? (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge tone="info">Assignée à {staffNameById.get(order.assignedTo) ?? "?"}</Badge>
                    <form action={unassignOrder.bind(null, slug, order.id)}>
                      <button type="submit" className="text-red-500 hover:text-red-700">
                        Retirer
                      </button>
                    </form>
                  </div>
                ) : (
                  <form action={assignOrderToStaff.bind(null, slug, order.id)} className="flex items-center gap-2 flex-wrap">
                    <select name="assignedTo" className="border border-stone-200 rounded-md px-2 py-1 text-xs">
                      <option value="">— Assigner toute la commande à —</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs rounded-md px-2 py-1 text-white" style={{ backgroundColor: accentColor }}>
                      Assigner
                    </button>
                  </form>
                )}
              </div>

              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400">{order.orderType === "boutique" ? "Boutique" : "Traiteur"}</span>
                  {(() => {
                    const badge = PAYMENT_BADGE[order.paymentStatus] ?? { label: order.paymentStatus, tone: "neutral" as const };
                    return <Badge tone={badge.tone}>{badge.label}</Badge>;
                  })()}
                </div>
                <Link href={`/${slug}/pro/commande/${order.id}`} className="text-xs underline" style={{ color: accentColor }}>
                  Modifier
                </Link>
              </div>
            </div>
          </div>
        ))}
        {activeOrders.length === 0 && (
          <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucune commande pour ce jour.</p>
        )}
      </div>
      </div>
    </>
  );
}
