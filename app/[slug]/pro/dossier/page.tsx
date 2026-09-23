import Link from "next/link";
import { redirect } from "next/navigation";
import { getEstablishmentBySlug, getLegalEntitiesForEstablishment, getOrdersArchive, getPurchaseInvoices } from "@/lib/db/queries";
import { runAsTenant } from "@/lib/tenant";
import { formatCHF } from "@/lib/format";
import { formatDateLabel, getMonthBounds, getTodayISO, monthOfDate } from "@/lib/slots";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { requireOwnerScope } from "./actions";
import { AddPurchaseInvoiceForm } from "./AddPurchaseInvoiceForm";

const PAYMENT_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Non payé", tone: "warning" },
  deposit_paid: { label: "Acompte versé", tone: "info" },
  paid: { label: "Payé", tone: "success" },
  refunded_partial: { label: "Remb. partiel", tone: "neutral" },
  refunded_full: { label: "Remboursé", tone: "neutral" },
};

export default async function DossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; clientName?: string; entityId?: string }>;
}) {
  const { slug } = await params;
  const { dateFrom: dateFromParam, dateTo: dateToParam, clientName, entityId } = await searchParams;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) redirect(`/${slug}/pro/login`);

  const { establishmentId, context, allowedEntityId, staffName } = await requireOwnerScope(slug);
  if (establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);

  const today = getTodayISO();
  const defaultStart = getMonthBounds(monthOfDate(today)).start;
  const dateFrom = dateFromParam || defaultStart;
  const dateTo = dateToParam || today;

  const { orders, purchases, entities } = await runAsTenant(context, async (tx) => {
    const orders = await getOrdersArchive(tx, {
      establishmentId: establishment.id,
      dateFrom,
      dateTo,
      clientName: clientName || undefined,
      entityId: entityId || undefined,
      allowedEntityId,
    });
    const purchases = await getPurchaseInvoices(tx, { establishmentId: establishment.id, allowedEntityId });
    const entities = await getLegalEntitiesForEstablishment(tx, establishment.id);
    return { orders, purchases, entities };
  });

  const entityNameById = new Map(entities.map((e) => [e.id, e.name]));
  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const reportQuery = `dateFrom=${dateFrom}&dateTo=${dateTo}`;

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={staffName}
      isOwner
      active="dossier"
    >
      <div className="flex flex-col gap-6">
        <ProPanel>
          <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Dossier des commandes</p>

          <form method="get" className="px-6 py-4 border-b border-stone-200 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Du</label>
              <input type="date" name="dateFrom" defaultValue={dateFrom} className="border border-stone-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Au</label>
              <input type="date" name="dateTo" defaultValue={dateTo} className="border border-stone-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Client</label>
              <input
                type="text"
                name="clientName"
                defaultValue={clientName ?? ""}
                placeholder="Nom du client"
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {!allowedEntityId && entities.length > 1 && (
              <div>
                <label className="block text-xs text-stone-400 mb-1">Entité</label>
                <select name="entityId" defaultValue={entityId ?? ""} className="border border-stone-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Toutes</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: accentColor }}>
              Filtrer
            </button>
          </form>

          <div className="divide-y divide-stone-100">
            {orders.map((order) => {
              const badge = PAYMENT_BADGE[order.paymentStatus] ?? { label: order.paymentStatus, tone: "neutral" as const };
              return (
                <div key={order.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{order.clientName}</p>
                    <p className="text-xs text-stone-400">
                      {formatDateLabel(order.pickupDate)} · {entityNameById.get(order.sellingEntityId) ?? "—"} ·{" "}
                      {order.orderType === "boutique" ? "Boutique" : "Traiteur"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <span className="text-sm font-medium whitespace-nowrap">{formatCHF(Number(order.totalAmount))}</span>
                    <Link
                      href={`/${slug}/pro/dossier/${order.id}/facture`}
                      target="_blank"
                      className="text-xs underline whitespace-nowrap"
                      style={{ color: accentColor }}
                    >
                      Voir la facture
                    </Link>
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucune commande sur cette période.</p>}
          </div>
        </ProPanel>

        <ProPanel>
          <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
            <p className="font-serif text-sm">Rapport comptable</p>
            <p className="text-xs text-stone-400">
              {formatDateLabel(dateFrom)} → {formatDateLabel(dateTo)}
            </p>
          </div>
          <div className="px-6 py-4 flex flex-wrap gap-3">
            <a
              href={`/${slug}/pro/dossier/rapport/pdf?${reportQuery}`}
              target="_blank"
              className="rounded-lg px-4 py-2 text-sm text-white"
              style={{ backgroundColor: accentColor }}
            >
              Télécharger le PDF
            </a>
            <a
              href={`/${slug}/pro/dossier/rapport/csv/factures?${reportQuery}`}
              className="rounded-lg px-4 py-2 text-sm border-2"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              CSV — Factures clients
            </a>
            <a
              href={`/${slug}/pro/dossier/rapport/csv/achats?${reportQuery}`}
              className="rounded-lg px-4 py-2 text-sm border-2"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              CSV — Factures d&apos;achat
            </a>
          </div>
        </ProPanel>

        <ProPanel>
          <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Factures d&apos;achat</p>
          <div className="divide-y divide-stone-100">
            {purchases.map((purchase) => (
              <div key={purchase.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{purchase.supplierName}</p>
                  <p className="text-xs text-stone-400">
                    {formatDateLabel(purchase.invoiceDate)} · {entityNameById.get(purchase.legalEntityId) ?? "—"}
                    {purchase.description ? ` · ${purchase.description}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-medium whitespace-nowrap">{formatCHF(Number(purchase.amount))}</span>
                  {purchase.scanUrl && (
                    <a href={purchase.scanUrl} target="_blank" className="text-xs underline whitespace-nowrap" style={{ color: accentColor }}>
                      Voir le scan
                    </a>
                  )}
                </div>
              </div>
            ))}
            {purchases.length === 0 && <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucune facture d&apos;achat enregistrée.</p>}
          </div>
          <div className="px-6 py-4 border-t border-stone-200">
            <AddPurchaseInvoiceForm
              slug={slug}
              entities={allowedEntityId ? [] : entities.map((e) => ({ id: e.id, name: e.name }))}
              accentColor={accentColor}
            />
          </div>
        </ProPanel>
      </div>
    </ProShell>
  );
}
