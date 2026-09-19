import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getEstablishmentBySlug,
  getInterEntityInvoices,
  getLegalEntitiesForEstablishment,
  getUninvoicedInterEntityOrders,
} from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { formatCHF } from "@/lib/format";
import { InvoiceGroupForm } from "./InvoiceGroupForm";
import { ManualInvoiceForm } from "./ManualInvoiceForm";

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function FacturationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { slug } = await params;
  const { start: startParam, end: endParam } = await searchParams;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { context } = staffTenant;

  const defaults = currentMonthRange();
  const periodStart = startParam ?? defaults.start;
  const periodEnd = endParam ?? defaults.end;

  // Requêtes séquentielles : tx est une connexion unique retenue pour toute
  // la transaction (SET LOCAL), pas un pool — deux requêtes concurrentes sur
  // le même client PostgreSQL ne sont pas supportées par node-postgres.
  const { uninvoiced, entities, invoices } = await runAsTenant(context, async (tx) => {
    const uninvoiced = await getUninvoicedInterEntityOrders(tx, establishment.id, periodStart, periodEnd);
    const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
    const invoices = await getInterEntityInvoices(tx, establishment.id);
    return { uninvoiced, entities, invoices };
  });

  const entityName = new Map(entities.map((e) => [e.id, e.name]));

  const groups = new Map<
    string,
    { fromEntityId: string; toEntityId: string; orders: { orderId: string; clientName: string; pickupDate: string; totalAmount: number }[] }
  >();
  for (const o of uninvoiced) {
    const key = `${o.executingEntityId}:${o.sellingEntityId}`;
    const group = groups.get(key) ?? { fromEntityId: o.executingEntityId, toEntityId: o.sellingEntityId, orders: [] };
    group.orders.push({ orderId: o.orderId, clientName: o.clientName, pickupDate: o.pickupDate, totalAmount: Number(o.totalAmount) });
    groups.set(key, group);
  }

  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <main className="max-w-2xl mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-6 py-4 text-white" style={{ backgroundColor: accentColor }}>
        <p className="font-serif text-sm">Facturation inter-entités — {establishment.name}</p>
        <Link href={`/${slug}/pro`} className="text-xs text-white/80 hover:text-white underline">
          Planning
        </Link>
      </div>

      <form className="flex items-center gap-3 px-6 py-3 border-b border-stone-200 text-xs">
        <span className="text-stone-400">Période</span>
        <input type="date" name="start" defaultValue={periodStart} className="border border-stone-200 rounded-md px-2 py-1" />
        <span className="text-stone-400">→</span>
        <input type="date" name="end" defaultValue={periodEnd} className="border border-stone-200 rounded-md px-2 py-1" />
        <button type="submit" className="rounded-md border border-stone-200 px-3 py-1">
          Filtrer
        </button>
      </form>

      <div className="p-6">
        <p className="text-xs text-stone-400 mb-3">À facturer</p>
        {groups.size === 0 && (
          <p className="text-sm text-stone-400">Aucune commande à facturer entre entités pour cette période.</p>
        )}
        {Array.from(groups.values()).map((group) => (
          <InvoiceGroupForm
            key={`${group.fromEntityId}:${group.toEntityId}`}
            slug={slug}
            fromEntityId={group.fromEntityId}
            toEntityId={group.toEntityId}
            fromName={entityName.get(group.fromEntityId) ?? "?"}
            toName={entityName.get(group.toEntityId) ?? "?"}
            periodStart={periodStart}
            periodEnd={periodEnd}
            orders={group.orders}
            accentColor={accentColor}
          />
        ))}
      </div>

      {entities.length >= 2 && (
        <div className="px-6 pb-6">
          <ManualInvoiceForm slug={slug} entities={entities.map((e) => ({ id: e.id, name: e.name }))} accentColor={accentColor} />
        </div>
      )}

      <div className="px-6 py-4 border-t border-stone-200">
        <p className="text-xs text-stone-400 mb-3">Factures générées</p>
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex justify-between text-sm">
              <span>
                {entityName.get(inv.fromEntityId) ?? "?"} → {entityName.get(inv.toEntityId) ?? "?"} · {inv.periodStart} – {inv.periodEnd}
              </span>
              <span className="font-medium">{formatCHF(Number(inv.totalAmount))}</span>
            </div>
          ))}
          {invoices.length === 0 && <p className="text-sm text-stone-400">Aucune facture générée pour l&apos;instant.</p>}
        </div>
      </div>
    </main>
  );
}
