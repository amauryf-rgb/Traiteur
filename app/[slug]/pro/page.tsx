import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getCapacityRulesForProducts, getEstablishmentBySlug, getOrdersForDate } from "@/lib/db/queries";
import { aggregateByProduct } from "@/lib/aggregate";
import { addDaysISO, formatDateLabel, getTodayISO } from "@/lib/slots";
import { formatCHF, initials } from "@/lib/format";
import { logout, togglePrepared } from "./actions";

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: "Non payé",
  deposit_paid: "Acompte versé",
  paid: "Payé",
  refunded_partial: "Remb. partiel",
  refunded_full: "Remboursé",
};

export default async function ProDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const { date: dateParam } = await searchParams;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const session = await getStaffSession();
  if (!session || session.establishmentId !== establishment.id) {
    redirect(`/${slug}/pro/login`);
  }

  const today = getTodayISO();
  const date = dateParam ?? today;
  const isToday = date === today;

  const dayOrders = await getOrdersForDate(establishment.id, date);
  const activeOrders = dayOrders.filter((o) => o.status !== "cancelled");
  const aggregated = aggregateByProduct(dayOrders);

  const rules = await getCapacityRulesForProducts(aggregated.map((a) => a.productId));
  const dailyMaxByProduct = new Map<string, number>();
  for (const rule of rules) {
    if (rule.scope === "per_day") dailyMaxByProduct.set(rule.productId, rule.maxQuantity);
  }

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

  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <main className="max-w-2xl mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-6 py-4 text-white" style={{ backgroundColor: accentColor }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-serif text-sm">
            {initials(establishment.name)}
          </div>
          <div>
            <p className="font-serif text-sm leading-tight">{establishment.name}</p>
            <p className="text-xs text-white/70 leading-tight">{session.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/${slug}/pro/comptoir`} className="text-xs text-white/80 hover:text-white underline">
            Comptoir
          </Link>
          {session.role !== "employee" && (
            <Link href={`/${slug}/pro/catalogue`} className="text-xs text-white/80 hover:text-white underline">
              Catalogue
            </Link>
          )}
          {session.role === "owner" && (
            <Link href={`/${slug}/pro/equipe`} className="text-xs text-white/80 hover:text-white underline">
              Équipe
            </Link>
          )}
          <form action={logout.bind(null, slug)}>
            <button type="submit" className="text-xs text-white/80 hover:text-white underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200">
        <Link href={`/${slug}/pro?date=${addDaysISO(date, -1)}`} className="text-stone-400 hover:text-stone-600 px-2">
          ←
        </Link>
        <p className="text-sm font-medium">{isToday ? "Aujourd'hui" : formatDateLabel(date)}</p>
        <Link href={`/${slug}/pro?date=${addDaysISO(date, 1)}`} className="text-stone-400 hover:text-stone-600 px-2">
          →
        </Link>
      </div>

      <div className="grid grid-cols-3 divide-x divide-stone-200 border-b border-stone-200 text-center">
        <div className="px-3 py-4">
          <p className="text-xl font-serif">{activeOrders.length}</p>
          <p className="text-xs text-stone-400 mt-1">Commande{activeOrders.length > 1 ? "s" : ""}</p>
        </div>
        <div className="px-3 py-4">
          <p className="text-xl font-serif">{formatCHF(chiffreDuJour)}</p>
          <p className="text-xs text-stone-400 mt-1">Chiffre du jour</p>
        </div>
        <div className="px-3 py-4">
          <p className="text-xl font-serif">{prochainRetrait ? prochainRetrait.replace(":", "h") : "—"}</p>
          <p className="text-xs text-stone-400 mt-1">Prochain retrait</p>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-stone-200">
        <p className="text-xs text-stone-400 mb-3">À produire {isToday ? "aujourd'hui" : "ce jour"}</p>
        {aggregated.length === 0 && <p className="text-sm text-stone-400">Aucune commande ce jour.</p>}
        <div className="flex flex-col gap-3">
          {aggregated.map((item) => {
            const max = dailyMaxByProduct.get(item.productId);
            const pct = max ? Math.min(100, Math.round((item.quantity / max) * 100)) : null;
            const nearLimit = pct !== null && pct >= 80;
            return (
              <div key={item.productId}>
                <div className="flex justify-between text-sm">
                  <span>{item.name}</span>
                  <span className={nearLimit ? "font-medium text-amber-700" : "font-medium"}>
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
              </div>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-stone-200">
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
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-stone-400">
                  {order.orderType === "boutique" ? "Boutique" : "Traiteur"} · {PAYMENT_BADGE[order.paymentStatus] ?? order.paymentStatus}
                </p>
                {session.role !== "employee" && (
                  <Link href={`/${slug}/pro/commande/${order.id}`} className="text-xs underline" style={{ color: accentColor }}>
                    Modifier
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
        {activeOrders.length === 0 && (
          <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucune commande pour ce jour.</p>
        )}
      </div>
    </main>
  );
}
