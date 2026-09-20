import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug, getManagedProducts, getOrdersForDate } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { aggregateByProduct } from "@/lib/aggregate";
import { getTodayISO } from "@/lib/slots";
import { formatCHF } from "@/lib/format";
import { buttonClassName } from "@/components/ui/Button";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { toggleActive } from "./actions";

export default async function CataloguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role === "employee") redirect(`/${slug}/pro`);
  const { session, context } = staffTenant;

  const { products, aggregated } = await runAsTenant(context, async (tx) => {
    const products = await getManagedProducts(tx, establishment.id);
    const todayOrders = await getOrdersForDate(tx, establishment.id, getTodayISO());
    const aggregated = aggregateByProduct(todayOrders);
    return { products, aggregated };
  });
  const quantityByProduct = new Map(aggregated.map((a) => [a.productId, a.quantity]));
  const accentColor = establishment.accentColor ?? "#1a1a1a";

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner={session.role === "owner"}
      active="catalogue"
    >
    <ProPanel>
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
        <p className="font-serif text-sm">Catalogue — {establishment.name}</p>
        <Link
          href={`/${slug}/pro/catalogue/nouveau`}
          className={`${buttonClassName("secondary")} !px-3 !py-1.5 text-xs`}
          style={{ borderColor: accentColor, color: accentColor }}
        >
          + Ajouter un produit
        </Link>
      </div>

      <p className="px-6 py-3 text-xs text-stone-400 border-b border-stone-200">
        Définissez une quantité maximale par produit pour éviter qu&apos;une commande ne dépasse votre capacité de production.
      </p>

      <div className="divide-y divide-stone-200">
        {products.map((product) => {
          const qty = quantityByProduct.get(product.id) ?? 0;
          const max = product.perDayMax;
          const pct = max ? Math.min(100, Math.round((qty / max) * 100)) : null;
          const nearLimit = pct !== null && pct >= product.alertThresholdPct;

          return (
            <div key={product.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-stone-50 flex items-center justify-center text-[10px] text-stone-300 shrink-0 uppercase">
                Photo
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${product.isActive ? "" : "text-stone-400 line-through"}`}>{product.name}</p>
                <p className="text-xs text-stone-400">
                  {product.categoryName ?? "Sans catégorie"} · {formatCHF(Number(product.priceAmount))}
                </p>
              </div>

              <div className="w-32 shrink-0">
                {max ? (
                  <>
                    <p className={`text-xs text-right ${nearLimit ? "text-amber-700 font-medium" : "text-stone-500"}`}>
                      {qty}/{max} aujourd&apos;hui
                    </p>
                    <div className="h-1.5 rounded-full bg-stone-100 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: nearLimit ? "#b45309" : accentColor }}
                      />
                    </div>
                  </>
                ) : product.perSlotMax ? (
                  <p className="text-xs text-stone-400 text-right">Max {product.perSlotMax}/créneau</p>
                ) : (
                  <p className="text-xs text-stone-300 text-right">Sans limite</p>
                )}
              </div>

              <form action={toggleActive.bind(null, slug, product.id, product.isActive)}>
                <button
                  type="submit"
                  className={`${buttonClassName("secondary")} !px-3 !py-1.5 text-xs whitespace-nowrap`}
                  style={product.isActive ? { borderColor: "#d6d3d1", color: "#78716c" } : { borderColor: accentColor, color: accentColor }}
                >
                  {product.isActive ? "Désactiver" : "Activer"}
                </button>
              </form>

              <Link
                href={`/${slug}/pro/catalogue/${product.id}`}
                className={`${buttonClassName("secondary")} !px-3 !py-1.5 text-xs whitespace-nowrap`}
                style={{ borderColor: accentColor, color: accentColor }}
              >
                Modifier
              </Link>
            </div>
          );
        })}
        {products.length === 0 && <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucun produit pour l&apos;instant.</p>}
      </div>
    </ProPanel>
    </ProShell>
  );
}
