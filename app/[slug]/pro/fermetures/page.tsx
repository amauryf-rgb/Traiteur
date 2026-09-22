import { notFound, redirect } from "next/navigation";
import { getEstablishmentBySlug, getStaffOrderTypeScope, getUpcomingClosures, type EstablishmentClosure } from "@/lib/db/queries";
import { requireStaffTenantContext, runAsTenant } from "@/lib/tenant";
import { formatDateLabel, getTodayISO } from "@/lib/slots";
import { Button } from "@/components/ui/Button";
import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { AddClosureForm } from "./AddClosureForm";
import { removeClosure, updateClosedWeekdays } from "./actions";
import type { OrderType } from "@/lib/types";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

const UNIVERSE_LABEL: Record<OrderType, string> = { traiteur: "Traiteur", boutique: "Boutique" };

export default async function FermeturesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const establishment = await getEstablishmentBySlug(slug);
  if (!establishment) notFound();

  const staffTenant = await requireStaffTenantContext();
  if (!staffTenant || staffTenant.session.establishmentId !== establishment.id) redirect(`/${slug}/pro/login`);
  if (staffTenant.session.role !== "owner") redirect(`/${slug}/pro`);
  const { session, context } = staffTenant;

  const today = getTodayISO();
  const { scope, closures } = await runAsTenant(context, async (tx) => ({
    scope: await getStaffOrderTypeScope(tx, session.staffMemberId),
    closures: await getUpcomingClosures(tx, establishment.id, today),
  }));

  const accentColor = establishment.accentColor ?? "#1a1a1a";
  // Un owner rattaché à un seul univers (ex. Richard/Boutique) ne gère que
  // le sien ; un owner sans univers précis (établissement mono-entité) gère
  // les deux, chacun dans sa propre section — voir "Trois points déjà
  // tranchés" dans la conversation d'origine pour ce choix : séparé, sans
  // bascule "voir tout" (contrairement au planning des commandes).
  const universes: OrderType[] = scope ? [scope] : ["traiteur", "boutique"];

  return (
    <ProShell
      slug={slug}
      establishment={{ name: establishment.name, accentColor: establishment.accentColor }}
      staffName={session.name}
      isOwner
      active="fermetures"
    >
    <ProPanel>
      <p className="font-serif text-sm px-6 py-4 border-b border-stone-200">Fermetures — {establishment.name}</p>

      {universes.map((universe) => (
        <ClosureSection
          key={universe}
          slug={slug}
          universe={universe}
          showLabel={universes.length > 1}
          closedWeekdays={universe === "boutique" ? establishment.closedWeekdaysBoutique : establishment.closedWeekdaysTraiteur}
          closures={closures.filter((c) => c.orderType === null || c.orderType === universe)}
          accentColor={accentColor}
        />
      ))}
    </ProPanel>
    </ProShell>
  );
}

function ClosureSection({
  slug,
  universe,
  showLabel,
  closedWeekdays,
  closures,
  accentColor,
}: {
  slug: string;
  universe: OrderType;
  showLabel: boolean;
  closedWeekdays: number[];
  closures: EstablishmentClosure[];
  accentColor: string;
}) {
  const closedWeekdaySet = new Set(closedWeekdays);

  return (
    <div className="border-b border-stone-200 last:border-b-0">
      {showLabel && <p className="px-6 pt-4 text-xs uppercase tracking-wide text-stone-400">{UNIVERSE_LABEL[universe]}</p>}

      <div className="px-6 py-4 border-b border-stone-100">
        <p className="text-xs text-stone-400 mb-3">
          Fermeture hebdomadaire récurrente — ces jours ne seront jamais proposés au client, chaque semaine.
        </p>
        <form action={updateClosedWeekdays.bind(null, slug, universe)} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            {WEEKDAY_OPTIONS.map((day) => (
              <label key={day.value} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="closedWeekdays" value={day.value} defaultChecked={closedWeekdaySet.has(day.value)} />
                {day.label}
              </label>
            ))}
          </div>
          <Button type="submit" accentColor={accentColor} className="self-start">
            Enregistrer
          </Button>
        </form>
      </div>

      <div className="px-6 py-4">
        <p className="text-xs text-stone-400 mb-3">Fermetures ponctuelles — congés, jours fériés</p>
        <div className="flex flex-col divide-y divide-stone-100 mb-4">
          {closures.map((closure) => (
            <div key={closure.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium capitalize">{formatDateLabel(closure.date)}</p>
                {closure.reason && <p className="text-xs text-stone-400 mt-0.5">{closure.reason}</p>}
              </div>
              <form action={removeClosure.bind(null, slug, closure.id)}>
                <button type="submit" className="text-xs text-red-600 hover:text-red-800 underline whitespace-nowrap">
                  Supprimer
                </button>
              </form>
            </div>
          ))}
          {closures.length === 0 && <p className="py-4 text-center text-stone-400 text-sm">Aucune fermeture ponctuelle à venir.</p>}
        </div>
        <AddClosureForm slug={slug} orderType={universe} accentColor={accentColor} />
      </div>
    </div>
  );
}
